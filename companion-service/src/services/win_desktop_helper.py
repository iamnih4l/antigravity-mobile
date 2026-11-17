import sys
import json
import time
import io
import base64
import ctypes
from ctypes import wintypes

# Enable Per-Monitor DPI awareness so screen capture & mouse coordinates match physical pixels 1:1
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

from PIL import ImageGrab
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
    'cmd': 0x11,  # Map Mac Cmd shortcuts to Windows Ctrl automatically
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
            if (rect[2] - rect[0]) < 100 or (rect[3] - rect[1]) < 80:
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
        })

    win32gui.EnumWindows(enum_cb, None)
    results.sort(key=lambda w: (not w['isAntigravity'], not w['active'], w['title'].lower()))
    return results[:25]


def focus_window(hwnd):
    hwnd = int(hwnd)
    if not win32gui.IsWindow(hwnd):
        raise ValueError('Window handle no longer exists')
    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    else:
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
    # Windows foreground lock workaround: quick Alt press allows SetForegroundWindow reliably
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
    # Windows wheel delta: 120 = 1 notch up, -120 = 1 notch down
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
    for attempt in range(5):
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


def capture_jpeg(max_width=1280, quality=72):
    img = ImageGrab.grab()
    orig_w, orig_h = img.size
    if max_width and orig_w > max_width:
        scale = max_width / float(orig_w)
        new_h = max(1, int(round(orig_h * scale)))
        img = img.resize((int(max_width), new_h))
    if img.mode != 'RGB':
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=int(quality), optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    return {
        'jpegBase64': b64,
        'screenWidth': orig_w,
        'screenHeight': orig_h,
        'frameWidth': img.size[0],
        'frameHeight': img.size[1],
        'activeWindow': get_active_window_title(),
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
        }
    if cmd == 'capture':
        data = capture_jpeg(
            max_width=req.get('maxWidth', 1280),
            quality=req.get('quality', 72),
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
