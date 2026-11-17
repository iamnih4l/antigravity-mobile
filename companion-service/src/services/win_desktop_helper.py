import sys
import json
import time
import io
import base64
import ctypes

# Enable Per-Monitor DPI awareness so screen capture & mouse coordinates match physical pixels 1:1
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

from PIL import ImageGrab, ImageChops
import win32gui
import win32con
import win32clipboard

user32 = ctypes.windll.user32

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800
KEYEVENTF_KEYUP = 0x0002

VK_MAP = {
    'enter': 0x0D,
    'return': 0x0D,
    'esc': 0x1B,
    'escape': 0x1B,
    'backspace': 0x08,
    'tab': 0x09,
    'space': 0x20,
    'delete': 0x2E,
    'up': 0x26,
    'down': 0x28,
    'left': 0x25,
    'right': 0x27,
    'home': 0x24,
    'end': 0x23,
    'pageup': 0x21,
    'pagedown': 0x22,
    'ctrl': 0x11,
    'control': 0x11,
    'cmd': 0x11,
    'shift': 0x10,
    'alt': 0x12,
    'win': 0x5B,
    '`': 0xC0,
    'backtick': 0xC0,
    '/': 0xBF,
    '-': 0xBD,
    '=': 0xBB,
    '[': 0xDB,
    ']': 0xDD,
}

for ch in 'abcdefghijklmnopqrstuvwxyz':
    VK_MAP[ch] = ord(ch.upper())
for ch in '0123456789':
    VK_MAP[ch] = ord(ch)
for n in range(1, 13):
    VK_MAP[f'f{n}'] = 0x6F + n

# Lightweight visual motion tracker for detecting when the AI agent is actively streaming vs finished
_motion_state = {
    'prev_thumb': None,
    'working_since': None,
    'last_motion_at': 0.0,
    'state': 'idle',  # 'idle' | 'working' | 'waiting'
}


def get_screen_size():
    w = user32.GetSystemMetrics(0)
    h = user32.GetSystemMetrics(1)
    return int(w), int(h)


def get_active_window_title():
    try:
        hwnd = win32gui.GetForegroundWindow()
        return win32gui.GetWindowText(hwnd) or 'Desktop'
    except Exception:
        return 'Desktop'


def list_windows():
    results = []
    fg = win32gui.GetForegroundWindow()

    def enum_cb(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = (win32gui.GetWindowText(hwnd) or '').strip()
        if not title:
            return
        if title in ('Program Manager', 'Settings', 'Windows Input Experience', 'Microsoft Text Input Application'):
            return
        try:
            rect = win32gui.GetWindowRect(hwnd)
            if (rect[2] - rect[0]) < 150 or (rect[3] - rect[1]) < 100:
                return
        except Exception:
            return
        lower = title.lower()
        is_ide = ('antigravity' in lower) or ('visual studio code' in lower) or ('cursor' in lower)
        results.append({
            'hwnd': int(hwnd),
            'title': title,
            'active': int(hwnd) == int(fg),
            'isAntigravity': is_ide,
            'rect': [int(rect[0]), int(rect[1]), int(rect[2]), int(rect[3])],
        })

    win32gui.EnumWindows(enum_cb, None)
    results.sort(key=lambda w: (not w['isAntigravity'], not w['active'], w['title'].lower()))
    return results[:25]


def find_ide_window_rect(screen_w, screen_h):
    """Returns clamped (left, top, right, bottom) of the foreground or first visible Antigravity/VS Code window."""
    try:
        fg = win32gui.GetForegroundWindow()
        fg_title = (win32gui.GetWindowText(fg) or '').lower()
        if ('antigravity' in fg_title or 'visual studio code' in fg_title or 'cursor' in fg_title) and not win32gui.IsIconic(fg):
            r = win32gui.GetWindowRect(fg)
            return _clamp_rect(r, screen_w, screen_h)
    except Exception:
        pass

    for w in list_windows():
        if w['isAntigravity']:
            r = w.get('rect')
            if r:
                return _clamp_rect(r, screen_w, screen_h)

    return (0, 0, screen_w, screen_h)


def _clamp_rect(rect, screen_w, screen_h):
    l = max(0, min(screen_w - 1, int(rect[0])))
    t = max(0, min(screen_h - 1, int(rect[1])))
    r = max(l + 100, min(screen_w, int(rect[2])))
    b = max(t + 100, min(screen_h, int(rect[3])))
    return (l, t, r, b)


def focus_window(hwnd):
    hwnd = int(hwnd)
    if not win32gui.IsWindow(hwnd):
        raise ValueError('Window handle no longer exists')
    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    else:
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
    user32.keybd_event(0x12, 0, 0, 0)
    user32.keybd_event(0x12, 0, KEYEVENTF_KEYUP, 0)
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass
    time.sleep(0.08)
    return get_active_window_title()


def move_and_click(x, y, button='left', double=False):
    x, y = int(round(x)), int(round(y))
    user32.SetCursorPos(x, y)
    time.sleep(0.02)
    down = MOUSEEVENTF_RIGHTDOWN if button == 'right' else MOUSEEVENTF_LEFTDOWN
    up = MOUSEEVENTF_RIGHTUP if button == 'right' else MOUSEEVENTF_LEFTUP
    clicks = 2 if double else 1
    for _ in range(clicks):
        user32.mouse_event(down, 0, 0, 0, 0)
        time.sleep(0.02)
        user32.mouse_event(up, 0, 0, 0, 0)
        if double:
            time.sleep(0.05)


def scroll_at(x, y, delta):
    if x is not None and y is not None:
        user32.SetCursorPos(int(round(x)), int(round(y)))
        time.sleep(0.02)
    user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(delta), 0)


def press_combo(combo_str):
    parts = [p.strip().lower() for p in str(combo_str).split('+') if p.strip()]
    vks = [VK_MAP[p] for p in parts if p in VK_MAP]
    if not vks:
        raise ValueError(f'Unsupported shortcut: {combo_str}')
    for vk in vks:
        user32.keybd_event(vk, 0, 0, 0)
        time.sleep(0.015)
    for vk in reversed(vks):
        user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(0.015)


def set_clipboard_text(text):
    for _ in range(5):
        try:
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, str(text))
            finally:
                win32clipboard.CloseClipboard()
            return
        except Exception:
            time.sleep(0.05)
    raise RuntimeError('Could not access Windows clipboard')


def type_text_via_paste(text, submit=False):
    set_clipboard_text(text)
    time.sleep(0.04)
    press_combo('ctrl+v')
    if submit:
        time.sleep(0.08)
        press_combo('enter')


def _update_agent_motion(cropped_img):
    """Detects visual streaming motion inside the IDE/Chat viewport."""
    now = time.time()
    thumb = cropped_img.convert('L').resize((48, 48))
    prev = _motion_state['prev_thumb']
    _motion_state['prev_thumb'] = thumb

    if prev is None:
        return _motion_state['state']

    diff = ImageChops.difference(thumb, prev)
    hist = diff.histogram()
    # Count pixels that changed meaningfully (delta >= 12)
    total_px = 48 * 48
    changed_px = sum(hist[12:])
    change_ratio = changed_px / float(total_px)

    if change_ratio >= 0.008:
        # Meaningful text/UI change detected
        _motion_state['last_motion_at'] = now
        if _motion_state['working_since'] is None:
            _motion_state['working_since'] = now
        # Promote to 'working' once sustained >= 1.2s
        if (now - _motion_state['working_since']) >= 1.2:
            _motion_state['state'] = 'working'
    else:
        # No visual change on this frame
        since_motion = now - _motion_state['last_motion_at']
        if _motion_state['state'] == 'working' and since_motion >= 3.0:
            _motion_state['state'] = 'waiting'
            _motion_state['working_since'] = None
        elif _motion_state['state'] == 'waiting' and since_motion >= 12.0:
            _motion_state['state'] = 'idle'
        elif _motion_state['state'] == 'idle' and since_motion >= 2.0:
            _motion_state['working_since'] = None

    return _motion_state['state']


def capture_jpeg(max_width=1280, quality=76, mode='chat_right', chat_pct=38):
    full_img = ImageGrab.grab()
    screen_w, screen_h = full_img.size

    pct = max(22, min(65, int(chat_pct or 38))) / 100.0
    crop_l, crop_t, crop_r, crop_b = 0, 0, screen_w, screen_h

    if mode in ('chat_right', 'chat_left', 'ide'):
        ide_l, ide_t, ide_r, ide_b = find_ide_window_rect(screen_w, screen_h)
        ide_w = ide_r - ide_l
        if mode == 'ide':
            crop_l, crop_t, crop_r, crop_b = ide_l, ide_t, ide_r, ide_b
        elif mode == 'chat_right':
            crop_w = max(320, int(round(ide_w * pct)))
            crop_l = max(ide_l, ide_r - crop_w)
            crop_t, crop_r, crop_b = ide_t, ide_r, ide_b
        elif mode == 'chat_left':
            crop_w = max(320, int(round(ide_w * pct)))
            crop_l, crop_t = ide_l, ide_t
            crop_r = min(ide_r, ide_l + crop_w)
            crop_b = ide_b

    img = full_img.crop((crop_l, crop_t, crop_r, crop_b))
    crop_w = crop_r - crop_l
    crop_h = crop_b - crop_t

    agent_state = _update_agent_motion(img)

    if max_width and crop_w > max_width:
        scale = max_width / float(crop_w)
        new_h = max(1, int(round(crop_h * scale)))
        img = img.resize((int(max_width), new_h))

    if img.mode != 'RGB':
        img = img.convert('RGB')

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=int(quality), optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')

    return {
        'jpegBase64': b64,
        'screenWidth': screen_w,
        'screenHeight': screen_h,
        'cropLeft': crop_l,
        'cropTop': crop_t,
        'cropWidth': crop_w,
        'cropHeight': crop_h,
        'frameWidth': img.size[0],
        'frameHeight': img.size[1],
        'activeWindow': get_active_window_title(),
        'agentState': agent_state,
    }


def handle_request(req):
    cmd = req.get('cmd')
    if cmd == 'status':
        w, h = get_screen_size()
        return {
            'ok': True,
            'screenWidth': w,
            'screenHeight': h,
            'activeWindow': get_active_window_title(),
            'windows': list_windows(),
            'agentState': _motion_state['state'],
        }
    if cmd == 'capture':
        data = capture_jpeg(
            max_width=req.get('maxWidth', 1280),
            quality=req.get('quality', 76),
            mode=req.get('mode', 'chat_right'),
            chat_pct=req.get('chatPct', 38),
        )
        return {'ok': True, **data}
    if cmd == 'windows':
        return {'ok': True, 'windows': list_windows(), 'activeWindow': get_active_window_title()}
    if cmd == 'focus_window':
        title = focus_window(req['hwnd'])
        return {'ok': True, 'activeWindow': title}
    if cmd == 'click':
        move_and_click(req['x'], req['y'], button=req.get('button', 'left'), double=bool(req.get('double', False)))
        return {'ok': True, 'activeWindow': get_active_window_title()}
    if cmd == 'scroll':
        scroll_at(req.get('x'), req.get('y'), req.get('delta', -360))
        return {'ok': True}
    if cmd == 'shortcut':
        press_combo(req.get('shortcut') or req.get('key'))
        return {'ok': True, 'activeWindow': get_active_window_title()}
    if cmd == 'type_text':
        type_text_via_paste(req.get('text', ''), submit=bool(req.get('submit', False)))
        return {'ok': True, 'activeWindow': get_active_window_title()}
    return {'ok': False, 'error': f'Unknown desktop command: {cmd}'}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get('id')
            res = handle_request(req)
            res['id'] = req_id
        except Exception as exc:
            res = {'id': req_id, 'ok': False, 'error': str(exc)}
        sys.stdout.write(json.dumps(res) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
