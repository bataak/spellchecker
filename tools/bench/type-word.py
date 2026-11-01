import json
import sys
import time
from pathlib import Path

import win32com.client

CHAR_DELAY = 0.2
MONGOLIAN = 1104
DO_NOT_SAVE = 0


def type_for(selection, text, seconds):
    end = time.time() + seconds
    typed = 0
    while time.time() < end:
        char = text[typed % len(text)]
        if char == "\n":
            selection.TypeParagraph()
        else:
            selection.TypeText(char)
        typed += 1
        time.sleep(CHAR_DELAY)
    return typed


def main():
    seconds = float(sys.argv[1])
    text = Path(sys.argv[2]).read_text(encoding="utf-8")
    word = win32com.client.DispatchEx("Word.Application")
    try:
        word.Visible = True
        doc = word.Documents.Add()
        word.Selection.LanguageID = MONGOLIAN
        typed = type_for(word.Selection, text, seconds)
        doc.Close(DO_NOT_SAVE)
    finally:
        word.Quit()
    print(json.dumps({"typed": typed}))


main()
