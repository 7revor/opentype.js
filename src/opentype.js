// opentype.js
// https://github.com/nodebox/opentype.js
// (c) 2014 Frederik De Bleser
// opentype.js may be freely distributed under the MIT license.

/* global ArrayBuffer, DataView, Uint8Array, XMLHttpRequest  */

'use strict';

var encoding = require('./encoding');
var _font = require('./font');
var parse = require('./parse');
var path = require('./path');

var cmap = require('./tables/cmap');
var cff = require('./tables/cff');
var glyf = require('./tables/glyf');
var gpos = require('./tables/gpos');
var head = require('./tables/head');
var hhea = require('./tables/hhea');
var hmtx = require('./tables/hmtx');
var kern = require('./tables/kern');
var loca = require('./tables/loca');
var maxp = require('./tables/maxp');
var _name = require('./tables/name');
var os2 = require('./tables/os2');
var post = require('./tables/post');
var sfnt = require('./tables/sfnt');

// File loaders /////////////////////////////////////////////////////////

// Convert a Node.js Buffer to an ArrayBuffer
function toArrayBuffer(buffer) {
    var i,
        arrayBuffer = new ArrayBuffer(buffer.length),
        data = new Uint8Array(arrayBuffer);

    for (i = 0; i < buffer.length; i += 1) {
        data[i] = buffer[i];
    }

    return arrayBuffer;
}

function loadFromFile(path, callback) {
    var fs = require('fs');
    fs.readFile(path, function (err, buffer) {
        if (err) {
            return callback(err.message);
        }

        callback(null, toArrayBuffer(buffer));
    });
}

function loadFromUrl(url, callback) {
    var request = new XMLHttpRequest();
    request.open('get', url, true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
        if (request.status !== 200) {
            return callback('Font could not be loaded: ' + request.statusText);
        }
        return callback(null, request.response);
    };
    request.send();
}

// Public API ///////////////////////////////////////////////////////////

// Parse the OpenType file data (as an ArrayBuffer) and return a Font object.
// If the file could not be parsed (most likely because it contains Postscript outlines)
// we return an empty Font object with the `supported` flag set to `false`.
function parseBuffer(buffer) {
    var font, data, version, numTables, i, p, tag, offset, hmtxOffset, glyfOffset, locaOffset,
        cffOffset, kernOffset, gposOffset, indexToLocFormat, numGlyphs, locaTable,
        shortVersion;
    // OpenType fonts use big endian byte ordering.
    // We can't rely on typed array view types, because they operate with the endianness of the host computer.
    // Instead we use DataViews where we can specify endianness.

    font = new _font.Font();
    data = new DataView(buffer, 0);

    version = parse.getFixed(data, 0);
    if (version === 1.0) {
        font.outlinesFormat = 'truetype';
    } else {
        version = parse.getTag(data, 0);
        if (version === 'OTTO') {
            font.outlinesFormat = 'cff';
        } else {
            throw new Error('Unsupported OpenType version ' + version);
        }
    }

    numTables = parse.getUShort(data, 4);

    // Offset into the table records.
    p = 12;
    for (i = 0; i < numTables; i += 1) {
        tag = parse.getTag(data, p);
        offset = parse.getULong(data, p + 8);
        switch (tag) {
        case 'cmap':
            font.tables.cmap = cmap.parse(data, offset);
            font.encoding = new encoding.CmapEncoding(font.tables.cmap.segments);
            if (!font.encoding) {
                font.supported = false;
            }
            break;
        case 'head':
            font.tables.head = head.parse(data, offset);
            font.unitsPerEm = font.tables.head.unitsPerEm;
            indexToLocFormat = font.tables.head.indexToLocFormat;
            break;
        case 'hhea':
            font.tables.hhea = hhea.parse(data, offset);
            font.ascender = font.tables.hhea.ascender;
            font.descender = font.tables.hhea.descender;
            font.numberOfHMetrics = font.tables.hhea.numberOfHMetrics;
            break;
        case 'hmtx':
            hmtxOffset = offset;
            break;
        case 'maxp':
            font.tables.maxp = maxp.parse(data, offset);
            font.numGlyphs = numGlyphs = font.tables.maxp.numGlyphs;
            break;
        case 'name':
             font.tables.name = _name.parse(data, offset);
            break;
        case 'OS/2':
            font.tables.os2 = os2.parse(data, offset);
            break;
        case 'post':
            font.tables.post = post.parse(data, offset);
            font.glyphNames = new encoding.GlyphNames(font.tables.post);
            break;
        case 'glyf':
            glyfOffset = offset;
            break;
        case 'loca':
            locaOffset = offset;
            break;
        case 'CFF ':
            cffOffset = offset;
            break;
        case 'kern':
            kernOffset = offset;
            break;
        case 'GPOS':
            gposOffset = offset;
            break;
        }
        p += 16;
    }

    if (glyfOffset && locaOffset) {
        shortVersion = indexToLocFormat === 0;
        locaTable = loca.parse(data, locaOffset, numGlyphs, shortVersion);
        font.glyphs = glyf.parse(data, glyfOffset, locaTable, font);
        hmtx.parse(data, hmtxOffset, font.numberOfHMetrics, font.numGlyphs, font.glyphs);
    } else if (cffOffset) {
        cff.parse(data, cffOffset, font);
    } else {
        font.supported = false;
    }

    if (font.supported) {
        if (kernOffset) {
            font.kerningPairs = kern.parse(data, kernOffset);
        } else {
            font.kerningPairs = {};
        }
        if (gposOffset) {
            gpos.parse(data, gposOffset, font);
        }
    }

    return font;
}

// Asynchronously load the font from a URL or a filesystem. When done, call the callback
// with two arguments `(err, font)`. The `err` will be null on success,
// the `font` is a Font object.
//
// We use the node.js callback convention so that
// opentype.js can integrate with frameworks like async.js.
function load(url, callback) {
    var loader = typeof process === 'undefined' || !process.browser ? loadFromFile : loadFromUrl;
    loader(url, function (err, arrayBuffer) {
        if (err) {
            return callback(err);
        }
        var font = parseBuffer(arrayBuffer);
        if (!font.supported) {
            return callback('Font is not supported (is this a Postscript font?)');
        }
        return callback(null, font);
    });
}

function computeMetrics(glyph) {
    var commands = glyph.path.commands;
    var xCoords = [];
    var yCoords = [];
    for (var i = 0; i < commands.length; i += 1) {
        var cmd = commands[i];
        if (cmd.type !== 'Z') {
            xCoords.push(cmd.x);
            yCoords.push(cmd.y);
        }
        if (cmd.type === 'Q' || cmd.type === 'C') {
            xCoords.push(cmd.x1);
            yCoords.push(cmd.y1);
        }
        if (cmd.type === 'C') {
            xCoords.push(cmd.x2);
            yCoords.push(cmd.y2);
        }
    }
    var metrics = {
        xMin: Math.min.apply(null, xCoords),
        yMin: Math.min.apply(null, yCoords),
        xMax: Math.max.apply(null, xCoords),
        yMax: Math.max.apply(null, yCoords),
        leftSideBearing: 0,
    };
    metrics.rightSideBearing = glyph.advanceWidth - metrics.leftSideBearing - (metrics.xMax - metrics.xMin);
    return metrics;
}

// Save the font and return a list of bytes.
function save() {
    // Write the version. OTTO indicates this is a CFF font.
    //var bytes = types.encode.TAG('OTTO');
    //var hexString = bytes.map(function (v) { return v.toString(16); });

    //var tag1 = encode.TAG('HALO');
    //var tag2 = encode.TAG('BART');
    //var bytes = encode.INDEX([tag1, tag2]);

     // Encode two glyphs: .notdef and A.
    var notdefPath = new path.Path();
    notdefPath.moveTo(0, 0);
    notdefPath.lineTo(0, 500);
    notdefPath.lineTo(300, 500);
    notdefPath.lineTo(300, 0);
    var notdefGlyph = {
        name: '.notdef',
        advanceWidth: 400,
        path: notdefPath
    };

    var aPath = new path.Path();
    aPath.moveTo(0, 0);
    aPath.lineTo(150, 500);
    aPath.lineTo(300, 0);
    aPath.moveTo(250, 50);
    aPath.moveTo(150, 450);
    aPath.moveTo(50, 50);
    var aGlyph = {
        name: 'A',
        advanceWidth: 400,
        path: aPath
    };

    var glyphs = [notdefGlyph, aGlyph];

    var xMins = [];
    var yMins = [];
    var xMaxs = [];
    var yMaxs = [];
    var advanceWidths = [];
    var leftSideBearings = [];
    var rightSideBearings = [];
    for (var i = 0; i < glyphs.length; i += 1) {
        var metrics = computeMetrics(glyphs[i]);
        xMins.push(metrics.xMin);
        yMins.push(metrics.yMin);
        xMaxs.push(metrics.xMax);
        yMaxs.push(metrics.yMax);
        leftSideBearings.push(metrics.leftSideBearing);
        rightSideBearings.push(metrics.rightSideBearing);
        advanceWidths.push(glyphs[i].advanceWidth);
    }
    var globals = {
        unitsPerEm: 1000,
        xMin: Math.min.apply(null, xMins),
        yMin: Math.min.apply(null, yMins),
        xMax: Math.max.apply(null, xMaxs),
        yMax: Math.min.apply(null, yMaxs),
        advanceWidthMax: Math.max.apply(null, advanceWidths),
        minLeftSideBearing: Math.min.apply(null, leftSideBearings),
        maxLeftSideBearing: Math.max.apply(null, leftSideBearings),
        minRightSideBearing: Math.min.apply(null, rightSideBearings)
    };

    var headTable = head.make({
        unitsPerEm: globals.unitsPerEm,
        xMin: globals.xMin,
        yMin: globals.yMin,
        xMax: globals.xMax,
        yMax: globals.yMax
    });
    var hheaTable = hhea.make({
        ascender:  984,
        descender: -273,
        advanceWidthMax: globals.advanceWidthMax,
        minLeftSideBearing: globals.minLeftSideBearing,
        minRightSideBearing: globals.minRightSideBearing,
        xMaxExtent: globals.maxLeftSideBearing + (globals.xMax - globals.xMin),
        numberOfHMetrics: glyphs.length
    });
    var maxpTable = maxp.make(glyphs.length);
    var os2Table = os2.make();
    var hmtxTable = hmtx.make(glyphs);
    var cmapTable = cmap.make();
     // FIXME We currently only have a glyph for the letter A.
    var nameTable = _name.make({sampleText: 'AAA'});
    var postTable = post.make();
    var cffTable = cff.make(glyphs);
    var tables = [headTable, hheaTable, maxpTable, os2Table, hmtxTable, cmapTable, nameTable, postTable, cffTable];

    var sfntTable = sfnt.make(tables);

    for (i = 0; i < sfntTable.tables.length; i += 1) {
        var table = sfntTable.tables[i];
        console.log(table.tableName, table);
    }
    console.log(sfntTable);

    var bytes = sfntTable.encode();
    var checkSum = sfnt.computeCheckSum(bytes);
    headTable.checkSumAdjustment = 0xB1B0AFBA - checkSum;

    // Build the font again, now with the proper checkSum.
    sfntTable = sfnt.make(tables);

    sfntTable.toBuffer = function () {
        var bytes = sfntTable.encode();
        var buffer = new ArrayBuffer(bytes.length);
        var intArray = new Uint8Array(buffer);
        for (var i = 0; i < bytes.length; i++) {
            intArray[i] = bytes[i];
        }
        return buffer;
    };

    sfntTable.download = function () {
        var buffer = sfntTable.toBuffer();

        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        window.requestFileSystem(window.TEMPORARY, buffer.byteLength, function (fs) {
            fs.root.getFile('tmp.otf', {create: true}, function (fileEntry) {
                fileEntry.createWriter(function (writer) {
                    var buffer = sfntTable.toBuffer();
                    var dataView = new DataView(buffer);
                    var blob = new Blob([dataView], {type: 'font/opentype'});
                    writer.write(blob);

                     writer.addEventListener('writeend', function () {
                        // Navigating to the file will download it.
                        location.href = fileEntry.toURL();
                     }, false);
                });
            });
        }, function (err) {
            console.log(err);
        });
    };

    return sfntTable;
}

exports.parse = parseBuffer;
exports.load = load;
exports.save = save;
