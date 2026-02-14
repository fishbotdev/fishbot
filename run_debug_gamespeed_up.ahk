#Requires AutoHotkey v2.0

; Press F1 to start the automation
F1:: {
    ; Press Shift + Backspace       
    Send "+{Backspace}"
    
    ; Small delay to allow the application to process the first command
    Sleep 100 
    
    ; Press Ctrl + + five times
    ; Note: {+} is used because the + symbol has special meaning in AHK (Shift)
    Loop 9 {
        Send "^{+}"
        Sleep 50 ; Tiny delay between repeats to ensure the app registers them
    }
}