// Data types used in the OpenType font file.
// All OpenType fonts use Motorola-style byte ordering (Big Endian)

'use strict';

var check = require('./check');
var encoding = require('./encoding');

var LIMIT16 = 32768; // The limit at which a 16-bit number switches signs == 2^15
var LIMIT32 = 2147483648; // The limit at which a 32-bit number switches signs == 2 ^ 31

var decode = {};
var encode = {};

// OpenType data types //////////////////////////////////////////////////////

// Convert an 8-bit unsigned integer to a list of 1 byte.
encode.BYTE = function (v) {
    check.argument(v >= 0 && v <= 255, 'Byte value should be between 0 and 255.');
    return [v];
};

// Convert a 8-bit signed integer to a list of 1 byte.
encode.CHAR = function (v) {
    return [v.charCodeAt(0)];
};

// Convert a 16-bit unsigned integer to a list of 2 bytes.
encode.USHORT = function (v) {
    return [(v >> 8) & 0xFF, v & 0xFF];
};

// Convert a 16-bit signed integer to a list of 2 bytes.
encode.SHORT = function (v) {
    // Two's complement
    if (v >= LIMIT16){
        v = - ( 2 * LIMIT16 - v);
    }
    return [(v >> 8) & 0xFF, v & 0xFF];
};

// Convert a 24-bit unsigned integer to a list of 3 bytes.
encode.UINT24 = function (v) {
    return [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

// Convert a 32-bit unsigned integer to a list of 4 bytes.
encode.ULONG = function (v) {
    return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

// Convert a 32-bit unsigned integer to a list of 4 bytes.
encode.LONG = function (v) {
     // Two's complement
    if (v >= LIMIT32){
        v = - ( 2 * LIMIT32 - v);
    }
    return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

encode.FIXED = encode.ULONG;
encode.FWORD = encode.SHORT;
encode.UFWORD = encode.USHORT;

// Convert a 4-char tag to a list of 4 bytes.
encode.TAG = function (v) {
    check.argument(v.length === 4, 'Tag should be exactly 4 ASCII characters.');
    return [v.charCodeAt(0),
            v.charCodeAt(1),
            v.charCodeAt(2),
            v.charCodeAt(3)];
};

// CFF data types ///////////////////////////////////////////////////////////

encode.Card8 = encode.BYTE;
encode.Card16 = encode.USHORT;
encode.OffSize = encode.BYTE;
encode.SID = encode.USHORT;

// Convert a numeric operand or charstring number to a variable-size list of bytes.
encode.NUMBER = function (v) {
    var v2, b0, b1;
    if (v >= -107 && v <= 107) {
        return [v + 139];
    } else if (v >= 108 && v <= 1131 ) {
        v2 = v - 108;
        b0 = (v2 >> 8) & 0xFF;
        b1 = v2 - (b0 << 8);
        return [b0 + 247, b1];
    } else if (v >= -1131 && v <= -108) {
        v2 = -v - 108;
        b0 = (v2 >> 8) & 0xFF;
        b1 = v2 - (b0 << 8);
        return [b0 + 251, b1];
    } else if (v >= -32768 && v <= 32767) {
        return encode.NUMBER16(v);
    } else {
        return encode.NUMBER32(v);
    }
};

// Convert a signed number between -32768 and +32767 to a two-byte value.
// This ensures we always two bytes, but is not the most compact format.
encode.NUMBER16 = function (v) {
    return [28, (v >> 8) & 0xFF, v & 0xFF];
};

// Convert a signed number between -(2^31) and +(2^31-1) to a four-byte value.
// This is useful if you want to be sure you always use four bytes,
// at the expense of wasting a few bytes for smaller numbers.
encode.NUMBER32 = function (v) {
    return [29, (v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
};

// Convert an ASCII string to a list of bytes.
encode.NAME = function (v) {
    var b = [];
    for (var i = 0; i < v.length; i += 1) {
        b.push(v.charCodeAt(i));
    }
    return b;
};

encode.STRING = encode.NAME;

// Convert a ASCII string to a list of UTF16 bytes.
encode.UTF16 = function (v) {
    var ZERO_CHAR = String.fromCharCode(0);
    var b = [];
    for (var i = 0; i < v.length; i += 1) {
        b.push(ZERO_CHAR);
        b.push(v.charCodeAt(i));
    }
    return b;
};

// Convert a list of values to a CFF INDEX structure.
// The values should already be encoded, that is, they should be arrays.
encode.INDEX = function (l) {
    var count, offSize, offset, offsets, offsetEncoder, encodedOffset, data, i, v;
    if (l.length === 0) {
        return [0, 0];
    }
    count = encode.Card16(l.length);
    offSize = (1 + Math.floor(Math.log(l.length)/Math.log(2)) / 8) | 0;
    offset = 1;
    offsets = [];
    offsetEncoder = [undefined, encode.BYTE, encode.USHORT, encode.UINT24, encode.ULONG][offSize];
    data = [];
    offsets.push(1); // First offset is always 1.
    for (i = 0; i < l.length; i += 1) {
        v = l[i];
        Array.prototype.push.apply(data, v);
        offset += v.length;
        encodedOffset = offsetEncoder(offset);
        Array.prototype.push.apply(offsets, encodedOffset);
    }
    return Array.prototype.concat(count,
                           encode.OffSize(offSize),
                           offsets,
                           data);
};

// Convert a string to a String ID (SID).
// The list of strings is modified in place.
encode.SID = function (v, strings) {
    var i;
    // Is the string in the CFF standard strings?
    i = encoding.cffStandardStrings.indexOf(v);
    if (i >= 0) {
        return i;
    }
    // Is the string already in the string index?
    i = strings.indexOf(v);
    if (i >= 0) {
        return i + encoding.cffStandardStrings.length;
    } else {
        strings.push(v);
        return encoding.cffStandardStrings.length + strings.length;
    }
};

encode.OPERATOR = function (v) {
    if (v < 1200) {
        return [v];
    } else {
        return [12, v - 1200];
    }
};

encode.OPERAND = function (v, type, strings) {
    var d, i, sid;
    d = [];
    if (Array.isArray(type)) {
        for (i = 0; i < type.length; i += 1) {
            check.argument(v.length === type.length, 'Not enough arguments given for type' + type);
            d = d.concat(encode.OPERAND(v[i], type[i]));
        }
    } else {
        if (type === 'SID') {
            sid = encode.SID(v, strings);
            d = d.concat(encode.NUMBER(sid));
        } else if (type === 'offset') {
            // We make it easy for ourselves and always encode offsets as
            // 4 bytes. This makes offset calculation for the top dict easier.
            d = d.concat(encode.NUMBER32(v));
        } else {
            // FIXME Add support for booleans
            d = d.concat(encode.NUMBER(v));
        }
    }
    return d;
};

// Utility functions ////////////////////////////////////////////////////////

// Convert a table object to bytes.
// A table contains a list of fields containing the metadata (name, type and default value).
// The table itself has the field values set as attributes.
encode.TABLE = function (table) {
    var d = [];
    for (var i = 0; i < table.fields.length; i += 1) {
        var field = table.fields[i];
        var encodingFunction = encode[field.type];
        check.argument(encodingFunction !== undefined, 'No encoding function for field type ' + field.type);
        var value = table[field.name];
        if (value === undefined) {
            value = field.value;
        }
        var bytes = encodingFunction(value);
        d = d.concat(bytes);
    }
    return d;
};

exports.decode = decode;
exports.encode = encode;
