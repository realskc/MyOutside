' MyOutside silent launcher (dev): double-click, no terminal window
Option Explicit
Dim fso, shell, repoRoot
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.CurrentDirectory = repoRoot
shell.Run "cmd /c pnpm.cmd dev", 0, False
