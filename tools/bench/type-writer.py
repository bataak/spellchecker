import json
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import uno
from com.sun.star.lang import Locale

PORT = 2002
CHAR_DELAY = 0.2
START_TRIES = 60
MAC_SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
WINDOWS_SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"
PARAGRAPH_BREAK = 0


def soffice_path():
    if platform.system() == "Darwin":
        return MAC_SOFFICE
    if platform.system() == "Windows":
        return WINDOWS_SOFFICE
    return shutil.which("soffice") or "soffice"


def start_office(profile):
    return subprocess.Popen(
        [
            soffice_path(),
            "--writer",
            "--norestore",
            "--nologo",
            "-env:UserInstallation=" + Path(profile).as_uri(),
            f"--accept=socket,host=localhost,port={PORT};urp;",
        ]
    )


def connect():
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local
    )
    url = f"uno:socket,host=localhost,port={PORT};urp;StarOffice.ComponentContext"
    for _ in range(START_TRIES):
        try:
            return resolver.resolve(url)
        except Exception:
            time.sleep(1)
    raise SystemExit("LibreOffice did not start")


def writer_document(desktop):
    time.sleep(3)
    doc = desktop.getCurrentComponent()
    if doc is None or not hasattr(doc, "Text"):
        doc = desktop.loadComponentFromURL("private:factory/swriter", "_blank", 0, ())
    return doc


def type_for(doc, text, seconds):
    cursor = doc.CurrentController.ViewCursor
    cursor.CharLocale = Locale("mn", "MN", "")
    end = time.time() + seconds
    typed = 0
    while time.time() < end:
        char = text[typed % len(text)]
        if char == "\n":
            doc.Text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        else:
            doc.Text.insertString(cursor, char, False)
        typed += 1
        time.sleep(CHAR_DELAY)
    return typed


def main():
    seconds = float(sys.argv[1])
    text = Path(sys.argv[2]).read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        office = start_office(profile)
        ctx = connect()
        desktop = ctx.ServiceManager.createInstanceWithContext(
            "com.sun.star.frame.Desktop", ctx
        )
        doc = writer_document(desktop)
        typed = type_for(doc, text, seconds)
        doc.setModified(False)
        doc.close(True)
        try:
            desktop.terminate()
        except Exception:
            office.terminate()
        office.wait(timeout=30)
    print(json.dumps({"typed": typed}))


main()
