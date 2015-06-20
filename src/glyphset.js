// The GlyphSet object

'use strict';

var _glyph = require('./glyph');

// A GlyphSet represents all glyphs available in the font, but modelled using
// a deferred glyph loader, for retrieving glyphs only once they are absolutely
// necessary, to keep the memory footprint down.
function GlyphSet(font) {
    this.font = font;
    this.length = 0;
    this.glyphs = {};
}

GlyphSet.prototype = {
    get: function(index) {
        if (typeof this.glyphs[index] === 'function') {
            this.glyphs[index] = this.glyphs[index]();
        }

        if (!this.glyphs[index]) {
            console.log(index + ' does not exist...');
        }

        return this.glyphs[index];
    },

    push: function(index, loader) {
        this.glyphs[index] = loader;
        this.length++;
    }
};

GlyphSet.glyphLoader = function(font, index) {
    return new _glyph.Glyph({index: index, font: font});
};

/**
 * Generate a stub glyph that can be filled with all metadata *except*
 * the "points" and "path" properties, which must be loaded only once
 * the glyph's path is actually requested for text shaping.
 */

GlyphSet.ttfGlyphLoader = function(font, index, parseGlyph, data, position, buildPath) {
    return function() {
        var glyph = new _glyph.Glyph({index: index, font: font});

        glyph.path = function() {
            parseGlyph(glyph, data, position);
            return buildPath(font.glyphs, glyph);
        };

        return glyph;
    };
};

GlyphSet.cffGlyphLoader = function(font, index, parseCFFCharstring, charstring) {
    return function() {
        var glyph = new _glyph.Glyph({index: index, font: font});

        glyph.path = function() {
            return parseCFFCharstring(font, glyph, charstring);
        };

        return glyph;
    };
};

module.exports = GlyphSet;
