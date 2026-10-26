"""Generate our own minimal geometric test fonts; no third-party font data or licenses."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont
root = Path(__file__).parent
for ttf in (True, False):
    fb = FontBuilder(1000, isTTF=ttf)
    fb.setupGlyphOrder([".notdef", "space", "A"])
    fb.setupCharacterMap({32: "space", 65: "A"})
    if ttf:
        glyphs = {}
        for name in [".notdef", "space", "A"]:
            pen = TTGlyphPen(None)
            if name != "space":
                pen.moveTo((100, 0)); pen.lineTo((300, 700)); pen.lineTo((500, 0)); pen.closePath()
            glyphs[name] = pen.glyph()
        fb.setupGlyf(glyphs)
    else:
        glyphs = {}
        for name in [".notdef", "space", "A"]:
            pen = T2CharStringPen(600, None)
            if name != "space":
                pen.moveTo((100, 0)); pen.lineTo((300, 700)); pen.lineTo((500, 0)); pen.closePath()
            glyphs[name] = pen.getCharString()
        fb.setupCFF("TMCGeneratedFixture", {"FullName": "TMC Generated Fixture", "FamilyName": "TMC Generated Fixture", "Weight": "Regular"}, glyphs, {})
    fb.setupHorizontalMetrics({name: (600, 0) for name in [".notdef", "space", "A"]})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "TMC Generated Fixture", "styleName": "Regular", "uniqueFontIdentifier": "TMCGeneratedFixtureRegular", "fullName": "TMC Generated Fixture Regular", "psName": "TMCGeneratedFixture-Regular", "version": "Version 1.0"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    fb.font["head"].created = fb.font["head"].modified = 3800000000
    fb.font.recalcTimestamp = False
    fb.save(root / ("geometric.ttf" if ttf else "geometric.otf"))
font = TTFont(root / "geometric.ttf", recalcTimestamp=False)
for flavor in ("woff", "woff2"):
    font.flavor = flavor
    font.save(root / f"geometric.{flavor}")
