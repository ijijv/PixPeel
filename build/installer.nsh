; PixPeel 安装向导的补充脚本 / extra steps for the PixPeel installer
; 向导顺序：欢迎 → 许可协议 → （为谁安装）→ 选择安装路径 → 安装进度 → 完成页（运行 / 创建桌面快捷方式）

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !define MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "创建桌面快捷方式 / Create a desktop shortcut"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION PixPeelDesktopShortcut
  !endif
!macroend

!macro customInstall
  ; 开始菜单快捷方式要保证存在。
  ; Windows 是靠这个快捷方式（AUMID = com.pixpeel.app）把系统通知的图标关联到本程序的，
  ; 缺了它，右下角通知就会显示成系统的“空白文档”图标。
  ; electron-builder 只在全新安装时建，更新安装不会补建，所以这里自己兜住。
  IfFileExists "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" 0 +3
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"

  ; 静默安装（如覆盖更新）时不弹完成页，所以如果之前已有桌面快捷方式，顺手刷新一下
  IfFileExists "$DESKTOP\PixPeel.lnk" 0 +2
    CreateShortCut "$DESKTOP\PixPeel.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\PixPeel.lnk"
!macroend

; 只在安装器里定义（卸载器那一遍不会用到，否则会触发 warning 6010）
!ifndef BUILD_UNINSTALLER
Function PixPeelDesktopShortcut
  CreateShortCut "$DESKTOP\PixPeel.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
FunctionEnd
!endif
