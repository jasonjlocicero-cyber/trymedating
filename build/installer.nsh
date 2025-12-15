!macro customInstall
  ; Register tryme:// protocol for current user
  WriteRegStr HKCU "Software\Classes\tryme" "" "URL:TryMeDating Link"
  WriteRegStr HKCU "Software\Classes\tryme" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\tryme\DefaultIcon" "" "$INSTDIR\TryMeDating.exe,0"
  WriteRegStr HKCU "Software\Classes\tryme\shell\open\command" "" '"$INSTDIR\TryMeDating.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\tryme"
!macroend
