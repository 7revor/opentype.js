// The `maxp` table establishes the memory requirements for the font.
// We need it just to get the number of glyphs in the font.
// https://www.microsoft.com/typography/OTSPEC/maxp.htm

'use strict';

var parse = require('../parse');
var table = require('../table');

function MaxpTable() {
}

MaxpTable.prototype = new table.Table('maxp', [
    {name: 'version', type: 'FIXED', value: 0x00005000},
    {name: 'numGlyphs', type: 'USHORT', value: 0}
]);

// Parse the maximum profile `maxp` table.
function parseMaxpTable(data, start) {
    var maxp = {},
        p = new parse.Parser(data, start);
    maxp.version = p.parseVersion();
    maxp.numGlyphs = p.parseUShort();
    if (maxp.majorVersion === 1) {
        maxp.maxPoints = p.parseUShort();
        maxp.maxContours = p.parseUShort();
        maxp.maxCompositePoints = p.parseUShort();
        maxp.maxCompositeContours = p.parseUShort();
        maxp.maxZones = p.parseUShort();
        maxp.maxTwilightPoints = p.parseUShort();
        maxp.maxStorage = p.parseUShort();
        maxp.maxFunctionDefs = p.parseUShort();
        maxp.maxInstructionDefs = p.parseUShort();
        maxp.maxStackElements = p.parseUShort();
        maxp.maxSizeOfInstructions = p.parseUShort();
        maxp.maxComponentElements = p.parseUShort();
        maxp.maxComponentDepth = p.parseUShort();
    }
    return maxp;
}

function encodeMaxpTable() {
    var t = new MaxpTable();
    t.numGlyphs = 2;
    console.log(t);
    return t.encode();
}

exports.parse = parseMaxpTable;
exports.encode = encodeMaxpTable;
