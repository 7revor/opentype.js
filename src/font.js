// The Font object

'use strict';

var path = require('./path');

// A Font represents a loaded OpenType font file.
// It contains a set of glyphs and methods to draw text on a drawing context,
// or to get a path representing the text.
function Font() {
    this.supported = true;
    this.glyphs = [];
    this.encoding = null;
    this.tables = {};
}

// Convert the given character to a single glyph index.
// Note that this function assumes that there is a one-to-one mapping between
// the given character and a glyph; for complex scripts this might not be the case.
Font.prototype.charToGlyphIndex = function (s) {
    return this.encoding.charToGlyphIndex(s);
};

// Convert the given character to a single Glyph object.
// Note that this function assumes that there is a one-to-one mapping between
// the given character and a glyph; for complex scripts this might not be the case.
Font.prototype.charToGlyph = function (c) {
    var glyphIndex, glyph;
    glyphIndex = this.charToGlyphIndex(c);
    glyph = this.glyphs[glyphIndex];
    if (!glyph) {
        glyph = this.glyphs[0]; // .notdef
    }
    return glyph;
};

// Convert the given text to a list of Glyph objects.
// Note that there is no strict one-to-one mapping between characters and
// glyphs, so the list of returned glyphs can be larger or smaller than the
// length of the given string.
Font.prototype.stringToGlyphs = function (s) {
    var i, c, glyphs;
    glyphs = [];
    for (i = 0; i < s.length; i += 1) {
        c = s[i];
        glyphs.push(this.charToGlyph(c));
    }
    return glyphs;
};

Font.prototype.nameToGlyphIndex = function (name) {
    return this.glyphNames.nameToGlyphIndex(name);
};

Font.prototype.nameToGlyph = function (name) {
    var glyphIndex, glyph;
    glyphIndex = this.nametoGlyphIndex(name);
    glyph = this.glyphs[glyphIndex];
    if (!glyph) {
        glyph = this.glyphs[0]; // .notdef
    }
    return glyph;
};

Font.prototype.glyphIndexToName = function (gid) {
    if (!this.glyphNames.glyphIndexToName) {
        return '';
    }
    return this.glyphNames.glyphIndexToName(gid);
};

// Retrieve the value of the kerning pair between the left glyph (or its index)
// and the right glyph (or its index). If no kerning pair is found, return 0.
// The kerning value gets added to the advance width when calculating the spacing
// between glyphs.
Font.prototype.getKerningValue = function (leftGlyph, rightGlyph) {
    leftGlyph = leftGlyph.index || leftGlyph;
    rightGlyph = rightGlyph.index || rightGlyph;
    var gposKerning = this.getGposKerningValue;
    return gposKerning ? gposKerning(leftGlyph, rightGlyph) :
        (this.kerningPairs[leftGlyph + ',' + rightGlyph] || 0);
};

// Helper function that invokes the given callback for each glyph in the given text.
// The callback gets `(glyph, x, y, fontSize, options)`.
Font.prototype.forEachGlyph = function (text, x, y, fontSize, options, callback) {
    var kerning, fontScale, glyphs, i, glyph, kerningValue;
    if (!this.supported) {
        return;
    }
    x = x !== undefined ? x : 0;
    y = y !== undefined ? y : 0;
    fontSize = fontSize !== undefined ? fontSize : 72;
    options = options || {};
    kerning = options.kerning === undefined ? true : options.kerning;
    fontScale = 1 / this.unitsPerEm * fontSize;
    glyphs = this.stringToGlyphs(text);
    for (i = 0; i < glyphs.length; i += 1) {
        glyph = glyphs[i];
        callback(glyph, x, y, fontSize, options);
        if (glyph.advanceWidth) {
            x += glyph.advanceWidth * fontScale;
        }
        if (kerning && i < glyphs.length - 1) {
            kerningValue = this.getKerningValue(glyph, glyphs[i + 1]);
            x += kerningValue * fontScale;
        }
    }
};

// Create a Path object that represents the given text.
//
// text - The text to create.
// x - Horizontal position of the beginning of the text. (default: 0)
// y - Vertical position of the *baseline* of the text. (default: 0)
// fontSize - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`. (default: 72)
// Options is an optional object that contains:
// - kerning - Whether to take kerning information into account. (default: true)
//
// Returns a Path object.
Font.prototype.getPath = function (text, x, y, fontSize, options) {
    var fullPath = new path.Path();
    this.forEachGlyph(text, x, y, fontSize, options, function (glyph, x, y, fontSize) {
        var path = glyph.getPath(x, y, fontSize);
        fullPath.extend(path);
    });
    return fullPath;
};

// Draw the text on the given drawing context.
//
// ctx - A 2D drawing context, like Canvas.
// text - The text to create.
// x - Horizontal position of the beginning of the text. (default: 0)
// y - Vertical position of the *baseline* of the text. (default: 0)
// fontSize - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`. (default: 72)
// Options is an optional object that contains:
// - kerning - Whether to take kerning information into account. (default: true)
Font.prototype.draw = function (ctx, text, x, y, fontSize, options) {
    this.getPath(text, x, y, fontSize, options).draw(ctx);
};

// Draw the points of all glyphs in the text.
// On-curve points will be drawn in blue, off-curve points will be drawn in red.
//
// ctx - A 2D drawing context, like Canvas.
// text - The text to create.
// x - Horizontal position of the beginning of the text. (default: 0)
// y - Vertical position of the *baseline* of the text. (default: 0)
// fontSize - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`. (default: 72)
// Options is an optional object that contains:
// - kerning - Whether to take kerning information into account. (default: true)
Font.prototype.drawPoints = function (ctx, text, x, y, fontSize, options) {
    this.forEachGlyph(text, x, y, fontSize, options, function (glyph, x, y, fontSize) {
        glyph.drawPoints(ctx, x, y, fontSize);
    });
};

// Draw lines indicating important font measurements for all glyphs in the text.
// Black lines indicate the origin of the coordinate system (point 0,0).
// Blue lines indicate the glyph bounding box.
// Green line indicates the advance width of the glyph.
//
// ctx - A 2D drawing context, like Canvas.
// text - The text to create.
// x - Horizontal position of the beginning of the text. (default: 0)
// y - Vertical position of the *baseline* of the text. (default: 0)
// fontSize - Font size in pixels. We scale the glyph units by `1 / unitsPerEm * fontSize`. (default: 72)
// Options is an optional object that contains:
// - kerning - Whether to take kerning information into account. (default: true)
Font.prototype.drawMetrics = function (ctx, text, x, y, fontSize, options) {
    this.forEachGlyph(text, x, y, fontSize, options, function (glyph, x, y, fontSize) {
        glyph.drawMetrics(ctx, x, y, fontSize);
    });
};

exports.Font = Font;
