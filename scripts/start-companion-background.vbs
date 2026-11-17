Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverPath = fso.BuildPath(scriptDir, "..\companion-service\src\server.mjs")
serverPath = fso.GetAbsolutePathName(serverPath)

WshShell.Run "node """ & serverPath & """", 0, False
