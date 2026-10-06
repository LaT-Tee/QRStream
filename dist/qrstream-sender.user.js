// ==UserScript==
// @name         QRStream Sender
// @namespace    qrstream.sender
// @version      1.3.0
// @license      MIT
// @description  Alt+Q 打开发送面板：彩格码（默认）或二维码，喷泉码抗丢帧。依赖全部内联，离线可用
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* eslint-disable */
/* jshint ignore:start */
/* 上面两行关掉 Tampermonkey 编辑器自带的代码检查：脚本内联了第三方库（qrcode-generator 等老式写法会反复 var 同名变量），
 * 检查器会报一大堆「'i' is already defined」之类的提示。它们只是风格警告，不影响运行。
 *
 * 本脚本内联了 qrcode-generator（MIT, https://github.com/kazuhikoarase/qrcode-generator）
 * 协议见 https://github.com/LaT-Tee/QRStream/blob/main/docs/PROTOCOL.md（QX4 二维码、QX5 彩格码）
 */
(function () {
  'use strict';
  const NS = {};
  (function () {
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

    NS.qrcode = qrcode;
  }).call(NS);
  (function (self) {
/* QX4 协议编解码（收发两端共用）。浏览器里挂到 self.QX，Node 测试里 require。
 * 帧：QX4:<SID>:<K>:<LEN>:<CRC32>:<SEQ>:<FCK32>:<BASE45载荷>*
 *   SEQ < K  ：系统帧（第 SEQ 个源块）
 *   SEQ >= K ：冗余帧 = rowBits(SID,SEQ,K) 选中的源块逐字节 XOR（GF(2) 随机线性喷泉码，每位 1/2）
 *   FCK32 = 载荷 CRC32（8 位 hex）
 * 数据包：[4字节 meta长度 BE][meta JSON][数据]，补 0 到 K*C
 */
(function (root) {
  'use strict';

  const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const B45V = new Int16Array(128).fill(-1);
  for (let i = 0; i < 45; i++) B45V[B45.charCodeAt(i)] = i;

  function b45enc(u8) {
    const out = new Array(Math.ceil(u8.length / 2));
    let o = 0;
    for (let i = 0; i + 1 < u8.length; i += 2) {
      const n = u8[i] * 256 + u8[i + 1];
      out[o++] = B45[n % 45] + B45[((n / 45) | 0) % 45] + B45[(n / 2025) | 0];
    }
    if (u8.length & 1) { const n = u8[u8.length - 1]; out[o++] = B45[n % 45] + B45[(n / 45) | 0]; }
    return out.join('');
  }

  // 只解偶数字节长度（3 字符 → 2 字节）；非法返回 null
  function b45dec(s) {
    if (s.length % 3) return null;
    const out = new Uint8Array(s.length / 3 * 2);
    for (let i = 0, o = 0; i < s.length; i += 3) {
      const a = B45V[s.charCodeAt(i)], b = B45V[s.charCodeAt(i + 1)], c = B45V[s.charCodeAt(i + 2)];
      if (a < 0 || b < 0 || c < 0) return null;
      const n = a + b * 45 + c * 2025;
      if (n > 65535) return null;
      out[o++] = n >> 8; out[o++] = n & 255;
    }
    return out;
  }

  const CRC_TABLE = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t; })();
  function crc32n(u8) { let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0; }
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

  // 必须与发送端逐位一致
  function rowBits(sid, seq, K) {
    let h = 2166136261;
    const s = sid + ':' + seq;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h | 0;
    const W = (K + 31) >>> 5, bits = new Uint32Array(W);
    for (let w = 0; w < W; w++) {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      bits[w] = (t ^ (t >>> 14)) >>> 0;
    }
    if (K & 31) bits[W - 1] &= (1 << (K & 31)) - 1;
    let any = 0; for (let w = 0; w < W; w++) any |= bits[w];
    if (!any) { const c = seq % K; bits[c >>> 5] |= 1 << (c & 31); }
    return bits;
  }

  /** 解析一帧文本；失败返回 null。payload 为 Uint8Array（长度 = C） */
  function parseFrame(txt) {
    if (typeof txt !== 'string' || txt.charCodeAt(txt.length - 1) !== 42 /* * */) return null;
    const v = txt.startsWith('QX4:') ? 4 : txt.startsWith('QX3:') ? 3 : 0;   // 兼容旧版 v3 发送端（16 位 FCK）
    if (!v) return null;
    let p = 4; const f = [];
    for (let i = 0; i < 6; i++) { const q = txt.indexOf(':', p); if (q < 0) return null; f.push(txt.slice(p, q)); p = q + 1; }
    const [sid, K, LEN, CRC, SEQ, FCK] = f;
    if (!/^[0-9A-Z]{4}$/.test(sid) || !/^\d+$/.test(K) || !/^\d+$/.test(LEN) || !/^[0-9A-F]{8}$/.test(CRC)
      || !/^\d+$/.test(SEQ) || !(v === 4 ? /^[0-9A-F]{8}$/ : /^[0-9A-F]{4}$/).test(FCK)) return null;
    const payload = b45dec(txt.slice(p, -1));
    if (!payload || !payload.length || payload.length & 3) return null;
    const fc = crc32n(payload);
    if (v === 4 ? hex(fc, 8) !== FCK : hex(fc & 0xFFFF, 4) !== FCK) return null;   // v4 = 32 位帧校验
    const k = +K, len = +LEN, seq = +SEQ;
    if (k < 1 || len < 4 || Math.ceil(len / payload.length) !== k) return null;
    return { v, sid, K: k, len, crc: CRC, seq, payload, C: payload.length };
  }

  
  /**
   * GF(2) 增量高斯消元（行阶梯形，逐帧约简）+ 收齐后在 Worker 里回代。
   *  - piv[c] = 以第 c 列为最低位的主元行 {bits|null, data}；bits=null 表示单位行（该源块已知）
   *  - 新帧先用 knownMask 一次性剥离所有已知块（只 XOR 载荷），再按列从低到高约简
   *  - 实测比"常驻 RREF"总计算量少 2~3 倍；回代放在 Worker 里分段上报进度，界面不卡
   */
  class FountainDecoder {
    constructor(sid, K, C) {
      this.sid = sid; this.K = K; this.C = C;
      this.W = (K + 31) >>> 5; this.CW = C >>> 2;
      this.piv = new Array(K);
      this.knownMask = new Uint32Array(this.W);
      this.rank = 0; this.known = 0; this.solved = false;
      this.seen = new Set(); this.received = 0;
      this.newly = [];          // 本次 add 新确定的单位行 [列, 's'=源帧 | 'r'=冗余帧消元得到]
    }
    get done() { return this.rank === this.K; }
    isKnown(c) { return (this.knownMask[c >>> 5] >>> (c & 31)) & 1; }

    /** @returns 'dup' | 'useless' | 'useful' */
    add(seq, payload /* Uint8Array，长度 C */) {
      this.newly.length = 0;
      if (this.seen.has(seq)) return 'dup';
      this.seen.add(seq); this.received++;
      const { W, K, piv, knownMask } = this;
      if (this.done || (seq < K && this.isKnown(seq))) return 'useless';
      const data = new Uint32Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.length));
      // 源帧对应的列上已有「非单位」主元（之前的冗余帧占了这一列）：让源帧当这一列的单位主元（该块立即确定），
      // 原主元行消掉这一列后重新约简——行空间不变，秩只在原行找到新主元时 +1
      if (seq < K && piv[seq]) {
        const old = piv[seq], CW = data.length;
        piv[seq] = { bits: null, data };
        this.known++; knownMask[seq >>> 5] |= 1 << (seq & 31); this.newly.push([seq, 's']);
        old.bits[seq >>> 5] &= ~(1 << (seq & 31));
        for (let j = 0; j < CW; j++) old.data[j] ^= data[j];
        this._reduce(old.bits, old.data, -1);
        return 'useful';
      }
      let bits;
      if (seq < K) { bits = new Uint32Array(W); bits[seq >>> 5] = 1 << (seq & 31); }
      else bits = rowBits(this.sid, seq, K);
      const CW = data.length;
      // 1) 剥离已知块
      for (let w = 0; w < W; w++) {
        let x = bits[w] & knownMask[w];
        if (!x) continue;
        bits[w] ^= x;
        while (x) {
          const b = 31 - Math.clz32(x & -x); x &= x - 1;
          const pd = piv[(w << 5) + b].data;
          for (let j = 0; j < CW; j++) data[j] ^= pd[j];
        }
      }
      // 2) 行阶梯约简
      return this._reduce(bits, data, seq) ? 'useful' : 'useless';
    }

    /** 把一行约简进行阶梯形；找到新主元返回 true（rank+1），约成 0 返回 false。seq 仅用于标记单位行来源 */
    _reduce(bits, data, seq) {
      const { W, piv, knownMask } = this, CW = data.length;
      for (let w = 0; w < W; w++) {
        let x;
        while ((x = bits[w]) !== 0) {
          const b = 31 - Math.clz32(x & -x), col = (w << 5) + b, p = piv[col];
          if (!p) {
            let unit = (x & (x - 1)) === 0;
            for (let j = w + 1; unit && j < W; j++) if (bits[j]) unit = false;
            piv[col] = { bits: unit ? null : bits, data };
            this.rank++;
            if (unit) { this.known++; knownMask[w] |= 1 << b; this.newly.push([col, seq === col ? 's' : 'r']); }
            return true;
          }
          if (p.bits) for (let j = w; j < W; j++) bits[j] ^= p.bits[j];
          else bits[w] = x & (x - 1);
          const pd = p.data;
          for (let j = 0; j < CW; j++) data[j] ^= pd[j];
        }
      }
      return false;
    }

    /** rank===K 后回代：从高列到低列。onProgress(已完成比例) 约每 2% 调一次 */
    solve(onProgress) {
      const { K, W, piv } = this;
      if (this.solved) return;
      let step = Math.max(1, (K / 50) | 0);
      for (let col = K - 1; col >= 0; col--) {
        const p = piv[col];
        if (p.bits) {
          const bits = p.bits, data = p.data, CW = data.length;
          bits[col >>> 5] &= ~(1 << (col & 31));
          for (let w = col >>> 5; w < W; w++) {
            let x = bits[w];
            while (x) {
              const b = 31 - Math.clz32(x & -x); x &= x - 1;
              const pd = piv[(w << 5) + b].data;
              for (let j = 0; j < CW; j++) data[j] ^= pd[j];
            }
          }
          p.bits = null;
        }
        if (onProgress && col % step === 0) onProgress(1 - col / K);
      }
      this.known = K; this.solved = true; this.knownMask.fill(0xFFFFFFFF);
    }

    /** 尚未确定的源块编号，压成 "3,7,10-12" */
    missingRanges(limit = 400) {
      const parts = []; let a = -1, n = 0;
      for (let j = 0; j <= this.K; j++) {
        const miss = j < this.K && !this.isKnown(j);
        if (miss && a < 0) a = j;
        if (!miss && a >= 0) { parts.push(a === j - 1 ? '' + a : a + '-' + (j - 1)); a = -1; if (++n >= limit) break; }
      }
      return parts.join(',');
    }

    /** 回代后拼出数据包 */
    packet(len) {
      const out = new Uint8Array(this.K * this.C);
      for (let i = 0; i < this.K; i++) out.set(new Uint8Array(this.piv[i].data.buffer), i * this.C);
      return out.subarray(0, len);
    }
  }

  const api = { B45, b45enc, b45dec, crc32n, hex, rowBits, parseFrame, FountainDecoder };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QX = api;
})(typeof self !== 'undefined' ? self : this);

  })(NS);
  (function (self) {
/* QX5 彩格码（收发两端共用）：自定义的屏幕→摄像头码型，一张图分成很多独立小块，混帧/局部模糊只丢坏掉的块。
 *
 * 版面（单位：格；cols、rows 为奇数）：
 *   四角 7×7 定位块（同心方块，任意方向过中心都是 1:1:3:1:1）+ 1 格白色隔离带
 *   四条时钟线：第 3 行 / 倒数第 4 行 / 第 3 列 / 倒数第 4 列，从定位块中心连到中心，黑白相间，用来数格数和校正几何
 *   导频：约 1/16 的格子颜色已知，逐块拟合「摄像头颜色 → 发送色阶」（校串色、白平衡、暗角、伽马）
 *         A 类导频只用各通道的最暗/最亮级（与色阶配置无关，读元信息时用），B 类覆盖全部色阶
 *   元信息：顶部、底部各一份，固定 8 色 + 强纠错（会话、K、长度、CRC、版面参数）
 *   数据块：其余格子按 tile×tile 分块，每块独立承载一个喷泉码符号
 *           [SEQ 32 位][载荷 C 字节][CRC32(SID‖SEQ‖载荷)] → K=7 码率 1/3 卷积码 → 速率匹配 → 交织 → 每格 RGB 各通道 2 或 4 级（格雷码）
 * 接收端：自适应二值化 → 找定位块 → 时钟线数格数 → 最小二乘单应 → 读元信息（试 4 个方向，CRC 判定）→ 逐块校色、软判决、Viterbi、CRC
 */
(function (root) {
  'use strict';
  const QX = root.QX || (typeof require === 'function' ? require('./codec.js') : null);
  const { crc32n } = QX;

  /* ================= 卷积码：约束长度 7，码率 1/3，生成多项式 133/171/165（八进制） ================= */
  const GEN = [0o133, 0o171, 0o165];
  const OUT = new Uint8Array(128);            // OUT[状态*2+输入] = 3 位输出
  for (let s = 0; s < 64; s++) for (let u = 0; u < 2; u++) {
    const reg = (u << 6) | s; let o = 0;
    for (let k = 0; k < 3; k++) { let x = reg & GEN[k], p = 0; while (x) { p ^= 1; x &= x - 1; } o |= p << k; }
    OUT[s * 2 + u] = o;
  }
  const OUT0 = new Uint8Array(64), OUT1 = new Uint8Array(64);
  for (let s = 0; s < 64; s++) { OUT0[s] = OUT[s * 2]; OUT1[s] = OUT[s * 2 + 1]; }
  function convEncode(bits) {
    const S = bits.length + 6, out = new Uint8Array(S * 3);
    let s = 0;
    for (let t = 0; t < S; t++) {
      const u = t < bits.length ? bits[t] : 0, o = OUT[s * 2 + u];
      out[t * 3] = o & 1; out[t * 3 + 1] = (o >> 1) & 1; out[t * 3 + 2] = o >> 2;
      s = (u << 5) | (s >> 1);
    }
    return out;
  }
  let vDec = new Uint8Array(0);
  const PM0 = new Float64Array(64), PM1 = new Float64Array(64), BM = new Float64Array(8);
  /** 软判决 Viterbi。L：母码对数似然比（正 = 0），长度 3*(nInfo+6) */
  function viterbi(L, nInfo) {
    const S = nInfo + 6;
    if (vDec.length < S * 64) vDec = new Uint8Array(S * 64);
    let pm = PM0, nx = PM1;
    pm.fill(-1e18); pm[0] = 0;
    for (let t = 0; t < S; t++) {
      const a = L[t * 3], b = L[t * 3 + 1], c = L[t * 3 + 2];
      for (let o = 0; o < 8; o++) BM[o] = (o & 1 ? -a : a) + (o & 2 ? -b : b) + (o & 4 ? -c : c);
      const base = t * 64, tail = t >= nInfo;              // 尾比特输入恒为 0
      // 蝶形：前驱 2j、2j+1 → 后继 j（输入 0）和 j+32（输入 1）
      for (let j = 0; j < 32; j++) {
        const s0 = j << 1, p0 = pm[s0], p1 = pm[s0 | 1];
        let m0 = p0 + BM[OUT0[s0]], m1 = p1 + BM[OUT0[s0 | 1]];
        if (m1 > m0) { nx[j] = m1; vDec[base + j] = 1; } else { nx[j] = m0; vDec[base + j] = 0; }
        if (tail) { nx[j | 32] = -1e18; continue; }
        m0 = p0 + BM[OUT1[s0]]; m1 = p1 + BM[OUT1[s0 | 1]];
        if (m1 > m0) { nx[j | 32] = m1; vDec[base + (j | 32)] = 1; } else { nx[j | 32] = m0; vDec[base + (j | 32)] = 0; }
      }
      const tmp = pm; pm = nx; nx = tmp;
    }
    const out = new Uint8Array(nInfo);
    let st = 0;
    for (let t = S - 1; t >= 0; t--) {
      if (t < nInfo) out[t] = st >> 5;
      st = ((st << 1) & 63) | vDec[t * 64 + st];
    }
    return out;
  }

  /* 速率匹配（循环缓冲）：先发第 0 路全部，再按黄金分割顺序发第 1、2 路；不够长就从头重复。任意码率下删余都均匀分布 */
  const PHI = 0.6180339887498949, cbCache = new Map(), ilCache = new Map();
  function circBuf(S) {
    let r = cbCache.get(S); if (r) return r;
    const ord = Array.from({ length: S }, (_, t) => t).sort((a, b) => ((a * PHI) % 1) - ((b * PHI) % 1));
    r = new Int32Array(3 * S); let k = 0;
    for (let t = 0; t < S; t++) r[k++] = t * 3;
    for (const t of ord) r[k++] = t * 3 + 1;
    for (const t of ord) r[k++] = t * 3 + 2;
    cbCache.set(S, r); return r;
  }
  /** 固定伪随机交织（只依赖长度） */
  function interleaver(n) {
    let p = ilCache.get(n); if (p) return p;
    p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i;
    let x = (Math.imul(n, 2654435761) >>> 0) || 1;
    for (let i = n - 1; i > 0; i--) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      const j = x % (i + 1), t = p[i]; p[i] = p[j]; p[j] = t;
    }
    ilCache.set(n, p); return p;
  }
  /** 加扰序列：发送位与之异或，避免全 0 / 全 1 数据（补零块、空白文件段）画成大片同色，影响测光和定位 */
  const scCache = new Map();
  function scrambler(n, seed) {
    const key = n + ':' + seed; let p = scCache.get(key); if (p) return p;
    p = new Uint8Array(n); let x = (Math.imul(seed + 1, 0x9E3779B9) ^ Math.imul(n, 0x85EBCA6B)) >>> 0 || 1;
    for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; p[i] = x >>> 31; }
    scCache.set(key, p); return p;
  }
  /** 信息位 → n 个发送位（已交织、加扰；seed 区分各块） */
  function codeBits(info, n, seed = 0) {
    const m = convEncode(info), cb = circBuf(info.length + 6), M = cb.length, il = interleaver(n), sc = scrambler(n, seed), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[il[i]] = m[cb[i % M]];
    for (let i = 0; i < n; i++) out[i] ^= sc[i];
    return out;
  }
  /** n 个发送位的 LLR → 信息位 */
  let dL = new Float32Array(0);
  function decodeBits(llr, nInfo, seed = 0) {
    const n = llr.length, S = nInfo + 6, cb = circBuf(S), M = cb.length, il = interleaver(n), sc = scrambler(n, seed);
    if (dL.length !== 3 * S) dL = new Float32Array(3 * S); else dL.fill(0);
    for (let i = 0; i < n; i++) { const j = il[i]; dL[cb[i % M]] += sc[j] ? -llr[j] : llr[j]; }
    return viterbi(dL, nInfo);
  }
  /* ================= LDPC：IRA 结构（信息位按码率选度分布 + 校验位双对角），分层归一化最小和译码 =================
   * 由 (n, k) 确定性构造（收发两端各自生成同一张图），尽量避开 4 环。同样码率下比 K=7 卷积码约好 1.6~1.8 dB（test/sim/ldpc-proto.js） */
  const ldpcCache = new Map();
  function ldpcCode(n, k) {
    const key = n + ':' + k; let code = ldpcCache.get(key); if (code) return code;
    const m = n - k, R = k / n, dvList = R < 0.58 ? [4, 4, 4, 4, 10] : R < 0.7 ? [3, 3, 6] : [3, 3, 3, 3, 8];
    let a = (Math.imul(n, 7919) ^ k) >>> 0 || 1;
    const rnd = () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
    let tot = 0; for (let i = 0; i < k; i++) tot += Math.min(dvList[i % dvList.length], m);
    const deck = new Int32Array(tot); for (let t = 0; t < tot; t++) deck[t] = t % m;
    for (let t = tot - 1; t > 0; t--) { const j = (rnd() * (t + 1)) | 0, x = deck[t]; deck[t] = deck[j]; deck[j] = x; }
    const pairs = new Set(), pk = (x, y) => x < y ? x * m + y : y * m + x;
    for (let j = 0; j + 1 < m; j++) pairs.add(pk(j, j + 1));
    const rows = Array.from({ length: m }, () => []);
    let p = 0;
    for (let i = 0; i < k; i++) {
      const dv = Math.min(dvList[i % dvList.length], m), ch = [];
      for (let t = 0; t < dv; t++) {
        let pick = -1;
        for (let q = p; q < tot && q < p + 400; q++) { const c = deck[q]; if (!ch.includes(c) && !ch.some(c2 => pairs.has(pk(c, c2)))) { pick = q; break; } }
        if (pick < 0) for (let q = p; q < tot; q++) if (!ch.includes(deck[q])) { pick = q; break; }
        if (pick < 0) pick = p;
        const c = deck[pick]; deck[pick] = deck[p]; deck[p] = c; p++; ch.push(c);
      }
      for (let x = 0; x < ch.length; x++) for (let y = x + 1; y < ch.length; y++) pairs.add(pk(ch[x], ch[y]));
      for (const c of ch) rows[c].push(i);
    }
    const infoRows = rows.map(r => Int32Array.from(r));
    for (let j = 0; j < m; j++) { rows[j].push(k + j); if (j + 1 < m) rows[j + 1].push(k + j); }
    const start = new Int32Array(m + 1); for (let c = 0; c < m; c++) start[c + 1] = start[c] + rows[c].length;
    const ev = new Int32Array(start[m]); for (let c = 0; c < m; c++) ev.set(rows[c], start[c]);
    let dmax = 0; for (let c = 0; c < m; c++) dmax = Math.max(dmax, rows[c].length);
    code = { n, k, m, start, ev, infoRows, L: new Float32Array(n), R: new Float32Array(ev.length), Q: new Float32Array(dmax) };
    ldpcCache.set(key, code); return code;
  }
  function ldpcEncode(code, info) {
    const { n, k, m, infoRows } = code, cw = new Uint8Array(n); cw.set(info);
    let prev = 0;
    for (let j = 0; j < m; j++) { let x = prev; const r = infoRows[j]; for (let t = 0; t < r.length; t++) x ^= info[r[t]]; cw[k + j] = x; prev = x; }
    return cw;
  }
  /** 分层归一化最小和。llr 按码字顺序（正 = 0）。8 轮后仍有 >15% 校验不满足就放弃（多半是混帧过渡带里的块） */
  function ldpcDecode(code, llr, maxIt = 40) {
    const { k, m, start, ev, L, R, Q } = code, alpha = 0.75;
    L.set(llr); R.fill(0);
    for (let it = 0; it < maxIt; it++) {
      for (let c = 0; c < m; c++) {
        const s0 = start[c], s1 = start[c + 1];
        let m1 = 1e30, m2 = 1e30, idx = -1, sg = 0;
        for (let e = s0; e < s1; e++) {
          const q = L[ev[e]] - R[e]; Q[e - s0] = q;
          const a = q < 0 ? -q : q;
          if (a < m1) { m2 = m1; m1 = a; idx = e; } else if (a < m2) m2 = a;
          if (q < 0) sg ^= 1;
        }
        for (let e = s0; e < s1; e++) {
          const q = Q[e - s0], mag = (e === idx ? m2 : m1) * alpha, r = (sg ^ (q < 0 ? 1 : 0)) ? -mag : mag;
          R[e] = r; L[ev[e]] = q + r;
        }
      }
      let bad = 0;
      for (let c = 0; c < m; c++) { let x = 0; for (let e = start[c]; e < start[c + 1]; e++) if (L[ev[e]] < 0) x ^= 1; bad += x; }
      if (!bad) break;
      if (it >= 7 && bad > m * 0.15) return null;
    }
    const out = new Uint8Array(k); for (let i = 0; i < k; i++) out[i] = L[i] < 0 ? 1 : 0;
    return out;
  }
  /** LDPC 版：信息位 → n 个发送位（交织、加扰同卷积码版） */
  function codeBitsLdpc(info, n, seed) {
    const cw = ldpcEncode(ldpcCode(n, info.length), info), il = interleaver(n), sc = scrambler(n, seed), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[il[i]] = cw[i];
    for (let i = 0; i < n; i++) out[i] ^= sc[i];
    return out;
  }
  let lL = new Float32Array(0);
  function decodeBitsLdpc(llr, nInfo, seed) {
    const n = llr.length, il = interleaver(n), sc = scrambler(n, seed);
    if (lL.length !== n) lL = new Float32Array(n);
    for (let i = 0; i < n; i++) { const j = il[i]; lL[i] = sc[j] ? -llr[j] : llr[j]; }
    return ldpcDecode(ldpcCode(n, nInfo), lL);
  }

  const toBits = (u8, out, at) => { for (let i = 0; i < u8.length; i++) for (let b = 0; b < 8; b++) out[at + i * 8 + b] = (u8[i] >> (7 - b)) & 1; };
  const fromBits = (bits, at, nBytes) => { const u8 = new Uint8Array(nBytes);
    for (let i = 0; i < nBytes; i++) { let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | bits[at + i * 8 + b]; u8[i] = v; } return u8; };

  /* ================= 版面 ================= */
  const LEVELS = { 2: [0, 255], 4: [0, 85, 170, 255] };
  const RATES = [1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5];
  const ROLE_DATA = 0, ROLE_FIXED = 1, ROLE_PILOT = 2, ROLE_META = 3, ROLE_PAD = 4;
  const META_CELLS = 120, META_BYTES = 22, META_INFO = (META_BYTES + 4) * 8;
  const QUIET = 2;
  function hash3(r, c, k) {
    let h = Math.imul(r + 1, 73856093) ^ Math.imul(c + 1, 19349663) ^ Math.imul(k + 1, 83492791);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return (h ^ (h >>> 16)) >>> 0;
  }
  const finderDark = (r, c) => { const d = Math.max(Math.abs(r - 3), Math.abs(c - 3)); return d === 3 || d <= 1; };
  const isPilotPos = (r, c) => (r & 3) === 1 && ((c + (((r >> 2) & 1) << 1)) & 3) === 1;

  const layoutCache = new Map();
  /** p = {cols, rows, levels:[lr,lg,lb], rate: RATES 下标, tile} */
  function makeLayout(p) {
    const cols = p.cols | 0, rows = p.rows | 0, levels = p.levels.map(Number), rateIdx = p.rate | 0, tile = p.tile | 0, fec = p.fec === 'conv' ? 'conv' : 'ldpc';
    const key = [cols, rows, levels.join(''), rateIdx, tile, fec].join(',');
    let L = layoutCache.get(key); if (L) return L;
    if (!(cols & 1) || !(rows & 1) || cols < 31 || rows < 31 || cols > 255 || rows > 255) throw new Error('版面尺寸必须是 31..255 的奇数');
    if (!levels.every(l => l === 2 || l === 4) || !RATES[rateIdx] || tile < 8 || tile > 63) throw new Error('版面参数不合法');
    const N = cols * rows, role = new Uint8Array(N), dark = new Uint8Array(N);
    const chBits = levels.map(l => Math.log2(l)), bpc = chBits[0] + chBits[1] + chBits[2];
    // 定位块 + 隔离带
    for (const [top, left] of [[1, 1], [1, 0], [0, 1], [0, 0]]) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const r = top ? i : rows - 1 - i, c = left ? j : cols - 1 - j, k = r * cols + c;
      role[k] = ROLE_FIXED; dark[k] = i < 7 && j < 7 && finderDark(i, j) ? 1 : 0;
    }
    // 时钟线
    for (let c = 8; c <= cols - 9; c++) for (const r of [3, rows - 4]) { role[r * cols + c] = ROLE_FIXED; dark[r * cols + c] = (c & 1) ? 0 : 1; }
    for (let r = 8; r <= rows - 9; r++) for (const c of [3, cols - 4]) { role[r * cols + c] = ROLE_FIXED; dark[r * cols + c] = (r & 1) ? 0 : 1; }
    // 导频：pil[k*3+ch] = 色阶下标；pilA 标记 A 类
    const pil = new Uint8Array(N * 3), pilA = new Uint8Array(N);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (role[k] !== ROLE_DATA || !isPilotPos(r, c)) continue;
      role[k] = ROLE_PILOT;
      const a = (((r >> 2) + (c >> 2)) & 1) === 0; pilA[k] = a ? 1 : 0;
      for (let ch = 0; ch < 3; ch++) { const h = hash3(r, c, ch), Lc = levels[ch]; pil[k * 3 + ch] = a ? ((h & 1) ? Lc - 1 : 0) : h % Lc; }
    }
    // 元信息：数据格按行扫描的最前 / 最后 META_CELLS 个
    const free = []; for (let k = 0; k < N; k++) if (role[k] === ROLE_DATA) free.push(k);
    const meta = [Int32Array.from(free.slice(0, META_CELLS)), Int32Array.from(free.slice(-META_CELLS))];
    for (const m of meta) for (const k of m) role[k] = ROLE_META;
    // 分块：数据格按希尔伯特曲线排序后等分成 T 组——每组格数相同（不浪费），且空间上紧凑（混帧/局部模糊只坏少数几组）
    let n2 = 1; while (n2 < Math.max(cols, rows)) n2 <<= 1;
    const order = [];
    for (let d = 0; d < n2 * n2; d++) {
      let t = d, x = 0, y = 0;
      for (let sq = 1; sq < n2; sq <<= 1) {
        const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
        if (!ry) { if (rx) { x = sq - 1 - x; y = sq - 1 - y; } const tmp = x; x = y; y = tmp; }
        x += sq * rx; y += sq * ry; t >>= 2;
      }
      if (x < cols && y < rows && role[y * cols + x] === ROLE_DATA) order.push(y * cols + x);
    }
    const T = Math.max(1, Math.round(order.length / Math.max(64, tile * tile * 0.8))), per = Math.floor(order.length / T);
    const rate = RATES[rateIdx];
    const C = ((Math.floor(per * bpc * rate) - (fec === 'conv' ? 6 : 0) - 64) >> 3) & ~3;
    if (C < 16) throw new Error('数据块太小');
    const nInfo = 64 + C * 8;
    const tiles = [];
    for (let i = 0; i < T; i++) {
      const cells = Int32Array.from(order.slice(i * per, (i + 1) * per));
      let r0 = rows, r1 = 0, c0 = cols, c1 = 0;
      for (const k of cells) { const r = (k / cols) | 0, c = k % cols; r0 = Math.min(r0, r); r1 = Math.max(r1, r + 1); c0 = Math.min(c0, c); c1 = Math.max(c1, c + 1); }
      tiles.push({ cells, r0, r1, c0, c1 });
    }
    for (let i = T * per; i < order.length; i++) role[order[i]] = ROLE_PAD;
    // 每块的校色邻域：块外扩半个块
    const pilotsNear = (r0, r1, c0, c1, onlyA) => {
      const out = [];
      for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
        const k = r * cols + c; if (role[k] === ROLE_PILOT && (!onlyA || pilA[k])) out.push(k);
      }
      return Int32Array.from(out);
    };
    const ext = Math.ceil(tile / 3);
    for (const t of tiles) t.pilots = pilotsNear(t.r0 - ext, t.r1 + ext, t.c0 - ext, t.c1 + ext, false);
    const metaPilots = meta.map(m => {
      let r0 = rows, r1 = 0; for (const k of m) { const r = (k / cols) | 0; r0 = Math.min(r0, r); r1 = Math.max(r1, r + 1); }
      return pilotsNear(r0 - 4, r1 + 4, 0, cols, true);
    });
    L = { cols, rows, N, levels, rateIdx, rate, tile, fec, chBits, bpc, role, dark, pil, pilA, meta, metaPilots, tiles, T: tiles.length, C, nInfo, key };
    layoutCache.set(key, L);
    return L;
  }

  /* ================= 发送端：画帧 ================= */
  const SID_RE = /^[0-9A-Z]{4}$/;
  function packMeta(L, s) {
    const b = new Uint8Array(META_BYTES), dv = new DataView(b.buffer);
    b[0] = 0x55;
    for (let i = 0; i < 4; i++) b[1 + i] = s.sid.charCodeAt(i);
    b[5] = s.K >>> 16; b[6] = (s.K >>> 8) & 255; b[7] = s.K & 255;
    dv.setUint32(8, s.len); dv.setUint32(12, parseInt(s.crc, 16)); dv.setUint16(16, s.C);
    b[18] = L.cols; b[19] = L.rows;
    b[20] = (L.levels[0] === 4 ? 1 : 0) | (L.levels[1] === 4 ? 2 : 0) | (L.levels[2] === 4 ? 4 : 0) | (L.rateIdx << 3) | (L.fec === 'ldpc' ? 64 : 0);
    b[21] = L.tile;
    const all = new Uint8Array(META_BYTES + 4); all.set(b); new DataView(all.buffer).setUint32(META_BYTES, crc32n(b));
    return all;
  }
  function unpackMeta(u8) {
    const b = u8.subarray(0, META_BYTES), dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
    if (b[0] !== 0x55 || dv.getUint32(META_BYTES) !== crc32n(b)) return null;
    const sid = String.fromCharCode(b[1], b[2], b[3], b[4]);
    if (!SID_RE.test(sid)) return null;
    return { sid, K: (b[5] << 16) | (b[6] << 8) | b[7], len: dv.getUint32(8), crc: dv.getUint32(12).toString(16).toUpperCase().padStart(8, '0'),
      C: dv.getUint16(16), cols: b[18], rows: b[19], levels: [b[20] & 1 ? 4 : 2, b[20] & 2 ? 4 : 2, b[20] & 4 ? 4 : 2], rate: (b[20] >> 3) & 7, fec: b[20] & 64 ? 'ldpc' : 'conv', tile: b[21] };
  }
  const sidBytes = sid => Uint8Array.from(sid, ch => ch.charCodeAt(0));
  function tileInfoBits(L, sid, seq, payload) {
    const bytes = new Uint8Array(8 + L.C); const dv = new DataView(bytes.buffer);
    dv.setUint32(0, seq >>> 0); bytes.set(payload, 4);
    const ck = new Uint8Array(8 + L.C); ck.set(sidBytes(sid)); ck.set(bytes.subarray(0, 4 + L.C), 4);
    dv.setUint32(4 + L.C, crc32n(ck));
    const bits = new Uint8Array(L.nInfo); toBits(bytes, bits, 0); return bits;
  }
  /** 把 bpc*cells 个位按格写成色阶：rgb[k*3+ch] = 0..255 */
  function putCells(L, cells, bits, rgb) {
    let p = 0;
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i];
      for (let ch = 0; ch < 3; ch++) {
        const lv = L.levels[ch];
        let g = bits[p++]; if (lv === 4) g = (g << 1) | bits[p++];
        const l = lv === 4 ? g ^ (g >> 1) : g;
        rgb[k * 3 + ch] = LEVELS[lv][l];
      }
    }
  }
  function putMeta(L, cells, bits, rgb) {
    let p = 0;
    for (let i = 0; i < cells.length; i++) for (let ch = 0; ch < 3; ch++) rgb[cells[i] * 3 + ch] = bits[p++] ? 255 : 0;
  }

  /** 发送端：按会话 + 版面生成每一帧。session 需要 {sid,K,len,crc,C,payload(seq)} */
  class GridFramer {
    constructor(session, layout) {
      const L = layout;
      if (session.C !== L.C) throw new Error('会话分块大小与版面不符');
      this.s = session; this.L = L;
      const base = new Uint8Array(L.N * 3);
      for (let k = 0; k < L.N; k++) {
        const r = (k / L.cols) | 0, c = k % L.cols;
        if (L.role[k] === ROLE_FIXED) base.fill(L.dark[k] ? 0 : 255, k * 3, k * 3 + 3);
        else if (L.role[k] === ROLE_PILOT) for (let ch = 0; ch < 3; ch++) base[k * 3 + ch] = LEVELS[L.levels[ch]][L.pil[k * 3 + ch]];
        else if (L.role[k] === ROLE_PAD) for (let ch = 0; ch < 3; ch++) base[k * 3 + ch] = (hash3(r, c, ch + 7) & 1) ? 255 : 0;
      }
      const mbits = codeBits((() => { const b = new Uint8Array(META_INFO); toBits(packMeta(L, session), b, 0); return b; })(), META_CELLS * 3, 1000);
      for (const m of L.meta) putMeta(L, m, mbits, base);
      this.base = base;
    }
    get per() { return this.L.T; }
    /** seqs（长度 = 块数）→ 每格 RGB */
    cells(seqs) {
      const L = this.L, rgb = this.base.slice();
      L.tiles.forEach((t, j) => {
        const info = tileInfoBits(L, this.s.sid, seqs[j], this.s.payload(seqs[j]));
        const n = t.cells.length * L.bpc;
        putCells(L, t.cells, L.fec === 'ldpc' ? codeBitsLdpc(info, n, j + 1) : codeBits(info, n, j + 1), rgb);
      });
      return rgb;
    }
    /** → {w, h, data: RGBA}，1 像素 = 1 格，四周 QUIET 格白边 */
    paint(seqs, out) {
      const L = this.L, rgb = this.cells(seqs), W = L.cols + QUIET * 2, H = L.rows + QUIET * 2;
      const d = out && out.length === W * H * 4 ? out : new Uint8ClampedArray(W * H * 4);
      d.fill(255);
      for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
        const k = r * L.cols + c, o = ((r + QUIET) * W + c + QUIET) * 4;
        d[o] = rgb[k * 3]; d[o + 1] = rgb[k * 3 + 1]; d[o + 2] = rgb[k * 3 + 2];
      }
      return { w: W, h: H, data: d };
    }
  }

  /* ================= 接收端 ================= */
  function luma(px, w, h, Y) {
    const n = w * h; if (!Y || Y.length !== n) Y = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) Y[i] = (px[j] + 2 * px[j + 1] + px[j + 2]) >> 2;
    return Y;
  }
  /** 自适应二值化：局部均值 0.9 倍以下为深（1） */
  function binarize(Y, w, h, buf) {
    const W1 = w + 1, I = buf && buf.I && buf.I.length === W1 * (h + 1) ? buf.I : new Uint32Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += Y[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + s; } }
    const B = buf && buf.B && buf.B.length === w * h ? buf.B : new Uint8Array(w * h), R = Math.max(8, Math.round(Math.min(w, h) / 10));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
        const sum = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
        B[y * w + x] = Y[y * w + x] * (x1 - x0) * (y1 - y0) * 10 < sum * 9 ? 1 : 0;
      }
    }
    return { I, B };
  }
  /** 沿 (dx,dy) 方向过 (x0,y0) 检查 1:1:3:1:1（两侧还要有浅色隔离）；返回 {c: 该方向上的中心坐标, m: 模块像素} 或 null */
  function crossCheck(B, w, h, x0, y0, m, dx, dy) {
    const x = Math.round(x0), y = Math.round(y0);
    const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? -1 : B[j * w + i];
    if (at(x, y) !== 1) return null;
    const lim = Math.ceil(m * 5) + 2;
    const walk = sgn => {               // 从中心往一侧数：深（中心）、浅环、深环、浅（隔离带）
      let i = x, j = y; const seg = [0, 0, 0, 0];
      for (let s = 0; s < 4; s++) {
        const want = (s & 1) ? 0 : 1;
        while (seg[s] < lim && at(i, j) === want) { seg[s]++; i += sgn * dx; j += sgn * dy; }
        if (!seg[s] || (s < 3 && seg[s] >= lim)) return null;
      }
      return seg;
    };
    const a = walk(-1), b = a && walk(1); if (!b) return null;
    const center = a[0] + b[0] - 1, tot = a[1] + a[2] + center + b[1] + b[2], mm = tot / 7, v = mm * 0.75;
    if (Math.abs(a[1] - mm) > v || Math.abs(a[2] - mm) > v || Math.abs(b[1] - mm) > v || Math.abs(b[2] - mm) > v || Math.abs(center - 3 * mm) > 3 * v) return null;
    if (a[3] < mm * 0.4 || b[3] < mm * 0.4) return null;
    const off = (b[0] - a[0]) / 2;
    return { c: dx ? x + off * dx : y + off * dy, m: mm };
  }
  function findFinders(B, w, h) {
    const cands = [], rl = new Int32Array(w + 2), rs = new Int32Array(w + 2);
    for (let y = 0; y < h; y++) {
      const row = y * w; let n = 0, cur = B[row], st = 0;
      for (let x = 1; x <= w; x++) { const v = x < w ? B[row + x] : 2; if (v !== cur) { rs[n] = st; rl[n] = x - st; n++; st = x; cur = v; } }
      const first = B[row];
      for (let i = (first ? 1 : 0); i + 6 < n; i += 2) {
        const a = rl[i + 1], b = rl[i + 2], c = rl[i + 3], d = rl[i + 4], e = rl[i + 5], tot = a + b + c + d + e;
        if (tot < 14) continue;
        const m = tot / 7, v = m * 0.7;
        if (Math.abs(a - m) > v || Math.abs(b - m) > v || Math.abs(d - m) > v || Math.abs(e - m) > v || Math.abs(c - 3 * m) > 3 * v) continue;
        if (rl[i] < 0.4 * m || rl[i + 6] < 0.4 * m) continue;
        const cx = rs[i + 3] + c / 2 - 0.5;
        const vv = crossCheck(B, w, h, cx, y, m, 0, 1); if (!vv) continue;
        const hh = crossCheck(B, w, h, cx, vv.c, m, 1, 0); if (!hh) continue;
        const dd = crossCheck(B, w, h, hh.c, vv.c, m, 1, 1); if (!dd) continue;
        const mm = (m + vv.m + hh.m) / 3;
        let hit = null;
        for (const q of cands) if (Math.abs(q.x - hh.c) < q.m * 1.5 && Math.abs(q.y - vv.c) < q.m * 1.5) { hit = q; break; }
        if (hit) { const n1 = hit.n + 1; hit.x = (hit.x * hit.n + hh.c) / n1; hit.y = (hit.y * hit.n + vv.c) / n1; hit.m = (hit.m * hit.n + mm) / n1; hit.n = n1; }
        else cands.push({ x: hh.c, y: vv.c, m: mm, n: 1 });
      }
    }
    return cands;
  }
  /** 从候选里挑四个组成凸四边形（模块大小一致、面积最大），按图像中顺时针排序 */
  function pickQuads(cands, maxQuads = 3) {
    const top = cands.filter(c => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 9), quads = [];
    const n = top.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const q = [top[a], top[b], top[c], top[d]];
      const ms = q.map(p => p.m); if (Math.max(...ms) > 2.2 * Math.min(...ms)) continue;
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      q.sort((p1, p2) => Math.atan2(p1.y - cy, p1.x - cx) - Math.atan2(p2.y - cy, p2.x - cx));
      let area = 0, convex = true, minSide = Infinity;
      for (let i = 0; i < 4; i++) {
        const p0 = q[i], p1 = q[(i + 1) & 3], p2 = q[(i + 2) & 3];
        area += p0.x * p1.y - p1.x * p0.y;
        if ((p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x) <= 0) convex = false;
        minSide = Math.min(minSide, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      }
      const mAvg = (ms[0] + ms[1] + ms[2] + ms[3]) / 4;
      if (!convex || minSide < 14 * mAvg) continue;
      quads.push({ q, area: area / 2, m: mAvg });
    }
    return quads.sort((x, y) => y.area - x.area).slice(0, maxQuads);
  }
  function sampleY(Y, w, h, x, y) {
    if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1.001) x = w - 1.001; if (y > h - 1.001) y = h - 1.001;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (Y[i] * (1 - fx) + Y[i + 1] * fx) * (1 - fy) + (Y[i + w] * (1 - fx) + Y[i + w + 1] * fx) * fy;
  }
  /** 定位块中心 a → b 的时钟线：返回 {count: 格数, pts: [[格坐标, x, y]]} 或 null */
  function readEdge(Y, w, h, a, b, m) {
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), step = Math.max(0.4, m / 5), n = Math.ceil(dist / step) + 1;
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p[i] = sampleY(Y, w, h, a.x + dx * t, a.y + dy * t); }
    const win = Math.max(2, Math.round(1.6 * m / step)), thr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let mn = 255, mx = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) { if (p[j] < mn) mn = p[j]; if (p[j] > mx) mx = p[j]; }
      thr[i] = mx - mn < 14 ? -1 : (mn + mx) / 2;
    }
    // 分段（边界做线性插值），太短的段并入邻居
    const bnd = [0], col = [p[0] < thr[0] ? 1 : 0];
    for (let i = 1; i < n; i++) {
      const d = thr[i] < 0 ? col[col.length - 1] : (p[i] < thr[i] ? 1 : 0);
      if (d !== col[col.length - 1]) {
        const t0 = thr[i], f = (p[i - 1] - p[i]) !== 0 ? (p[i - 1] - t0) / (p[i - 1] - p[i]) : 0.5;
        bnd.push(i - 1 + Math.min(1, Math.max(0, f))); col.push(d);
      }
    }
    bnd.push(n - 1);
    const minLen = (m / step) * 0.35;
    for (;;) {
      let k = -1, best = minLen;
      for (let i = 0; i < col.length; i++) { const len = bnd[i + 1] - bnd[i]; if (len < best) { best = len; k = i; } }
      if (k < 0 || col.length < 3) break;
      if (k === 0) { bnd.splice(1, 1); col.splice(0, 1); }
      else if (k === col.length - 1) { bnd.splice(k, 1); col.splice(k, 1); }
      else { bnd.splice(k, 2); col.splice(k, 2); }
    }
    const R = col.length;
    if (R < 23 || !(R & 1) || !col[0] || !col[R - 1]) return null;
    const lens = []; for (let i = 1; i < R - 1; i++) lens.push(bnd[i + 1] - bnd[i]);
    const med = lens.slice().sort((x, y) => x - y)[lens.length >> 1];
    for (const l of lens) if (l < med * 0.45 || l > med * 1.8) return null;
    const pts = [];
    for (let i = 1; i < R - 1; i++) { const t = (bnd[i] + bnd[i + 1]) / 2 / (n - 1); pts.push([4 + i + 0.5, a.x + dx * t, a.y + dy * t]); }
    return { count: R + 8, pts };
  }
  /** 最小二乘单应：src[i]=[u,v] → dst[i]=[x,y]（先各自归一化） */
  function fitHomography(src, dst) {
    const n = src.length, norm = P => {
      let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= n; my /= n;
      let d = 0; for (const [x, y] of P) d += Math.hypot(x - mx, y - my); const s = Math.SQRT2 / (d / n || 1);
      return { mx, my, s };
    };
    const ns = norm(src), nd = norm(dst), A = new Float64Array(64), bv = new Float64Array(8), row = new Float64Array(8);
    const acc = (r, val) => { for (let i = 0; i < 8; i++) { bv[i] += r[i] * val; for (let j = 0; j < 8; j++) A[i * 8 + j] += r[i] * r[j]; } };
    for (let i = 0; i < n; i++) {
      const u = (src[i][0] - ns.mx) * ns.s, v = (src[i][1] - ns.my) * ns.s, x = (dst[i][0] - nd.mx) * nd.s, y = (dst[i][1] - nd.my) * nd.s;
      row.set([u, v, 1, 0, 0, 0, -u * x, -v * x]); acc(row, x);
      row.set([0, 0, 0, u, v, 1, -u * y, -v * y]); acc(row, y);
    }
    const hv = solve(A, bv, 8); if (!hv) return null;
    const [h0, h1, h2, h3, h4, h5, h6, h7] = hv;
    return (u, v) => {
      const uu = (u - ns.mx) * ns.s, vv = (v - ns.my) * ns.s, ww = h6 * uu + h7 * vv + 1;
      return [((h0 * uu + h1 * vv + h2) / ww) / nd.s + nd.mx, ((h3 * uu + h4 * vv + h5) / ww) / nd.s + nd.my];
    };
  }
  function solve(A, b, n) {
    const M = Array.from({ length: n }, (_, i) => [...A.slice(i * n, i * n + n), b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  /** 采样每个需要的格子：5 点平均（中心 + 四个 ±0.2 格），返回 Float32Array(N*3)，未采样的为 NaN */
  function sampleCells(px, w, h, H, cols, list, out) {
    const o = 0.2;
    for (const k of list) {
      const r = (k / cols) | 0, c = k % cols;
      let R = 0, G = 0, Bv = 0;
      for (const [du, dv] of [[0, 0], [-o, -o], [o, -o], [-o, o], [o, o]]) {
        let [x, y] = H(c + 0.5 + du, r + 0.5 + dv);
        if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1.001) x = w - 1.001; if (y > h - 1.001) y = h - 1.001;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * w + x0) * 4, j = i + w * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        R += px[i] * w00 + px[i + 4] * w10 + px[j] * w01 + px[j + 4] * w11;
        G += px[i + 1] * w00 + px[i + 5] * w10 + px[j + 1] * w01 + px[j + 5] * w11;
        Bv += px[i + 2] * w00 + px[i + 6] * w10 + px[j + 2] * w01 + px[j + 6] * w11;
      }
      out[k * 3] = R / 5; out[k * 3 + 1] = G / 5; out[k * 3 + 2] = Bv / 5;
    }
  }
  /** 用导频拟合每个通道：t = a·R + b·G + c·B + d（t = 色阶/(级数-1)），再算各级中心与噪声方差 */
  function calibrate(L, obs, pilots) {
    if (pilots.length < 10) return null;
    const res = [];
    for (let ch = 0; ch < 3; ch++) {
      const Lc = L.levels[ch], top = Lc - 1, A = new Float64Array(16), b = new Float64Array(4);
      for (const k of pilots) {
        const x0 = obs[k * 3] / 255, x1 = obs[k * 3 + 1] / 255, x2 = obs[k * 3 + 2] / 255, t = L.pil[k * 3 + ch] / top, x = [x0, x1, x2, 1];
        for (let i = 0; i < 4; i++) { b[i] += x[i] * t; for (let j = 0; j < 4; j++) A[i * 4 + j] += x[i] * x[j]; }
      }
      for (let i = 0; i < 3; i++) A[i * 5] += 1e-3;   // 轻微正则：某通道导频全一样时也能解
      const co = solve(A, b, 4); if (!co) return null;
      const map = k => co[0] * obs[k * 3] / 255 + co[1] * obs[k * 3 + 1] / 255 + co[2] * obs[k * 3 + 2] / 255 + co[3];
      const sum = new Float64Array(Lc), cnt = new Float64Array(Lc);
      for (const k of pilots) { const l = L.pil[k * 3 + ch]; sum[l] += map(k); cnt[l]++; }
      const mu = new Float64Array(Lc);
      for (let l = 0; l < Lc; l++) mu[l] = cnt[l] >= 2 ? sum[l] / cnt[l] : l / top;
      let se = 0;
      for (const k of pilots) { const d = map(k) - mu[L.pil[k * 3 + ch]]; se += d * d; }
      const sp = Math.abs(mu[top] - mu[0]) / top;
      res.push({ co, mu, s2: Math.max(se / pilots.length, (sp * 0.06) ** 2) });
    }
    return res;
  }
  /** 一组格子 → 按 putCells 顺序的 LLR（正 = 0） */
  function cellLLR(cal, obs, cells, levels, out) {
    let p = 0;
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i], R = obs[k * 3] / 255, G = obs[k * 3 + 1] / 255, Bv = obs[k * 3 + 2] / 255;
      for (let ch = 0; ch < 3; ch++) {
        const c = cal[ch], x = c.co[0] * R + c.co[1] * G + c.co[2] * Bv + c.co[3], mu = c.mu, k2 = 1 / (2 * c.s2);
        if (levels[ch] === 2) {
          const d0 = (x - mu[0]) ** 2, d1 = (x - mu[1]) ** 2;
          out[p++] = Math.max(-12, Math.min(12, (d1 - d0) * k2));
        } else {
          // 格雷码：级 0..3 → 00,01,11,10；位 0 = 高位，位 1 = 低位
          const d = [0, 1, 2, 3].map(l => (x - mu[l]) ** 2 * k2);
          const b0 = Math.min(d[2], d[3]) - Math.min(d[0], d[1]), b1 = Math.min(d[1], d[2]) - Math.min(d[0], d[3]);
          out[p++] = Math.max(-12, Math.min(12, b0)); out[p++] = Math.max(-12, Math.min(12, b1));
        }
      }
    }
    return out;
  }

  /** 读一张摄像头画面。返回 {ok, meta?, frames: [{sid,K,len,crc,C,seq,payload}], tiles, okTiles, reason} */
  const scratch = {};
  /** 按单应预测时钟格位置，在附近找明暗极值，返回 [[u,v,x,y]]（几何精修用，不依赖数格数） */
  function refineEdge(Y, w, h, H, fixedV, from, to, horiz) {
    const pts = [];
    for (let c = from; c <= to; c++) {
      const u = c + 0.5, dark = (c & 1) === 0;
      const [x0, y0] = horiz ? H(u, fixedV) : H(fixedV, u), [x1, y1] = horiz ? H(u + 1, fixedV) : H(fixedV, u + 1);
      const dx = x1 - x0, dy = y1 - y0;
      let best = 0, bv = dark ? 1e9 : -1e9;
      const vals = [];
      for (let i = -4; i <= 4; i++) {          // ±0.4 格内找极值
        const t = i / 10, v = sampleY(Y, w, h, x0 + dx * t, y0 + dy * t); vals.push(v);
        if (dark ? v < bv : v > bv) { bv = v; best = i; }
      }
      const k = best + 4;
      if (k === 0 || k === 8) continue;           // 极值在边上：不可靠
      const a = vals[k - 1], b = vals[k], cc = vals[k + 1], den = a - 2 * b + cc;
      const off = (Math.abs(den) > 1e-6 ? 0.5 * (a - cc) / den : 0) + best;   // 抛物线插值
      const t = off / 10;
      pts.push(horiz ? [u, fixedV, x0 + dx * t, y0 + dy * t] : [fixedV, u, x0 + dx * t, y0 + dy * t]);
    }
    return pts;
  }
  /** 用 A 类导频判断方向是否对：返回校色残差（越小越像） */
  function pilotScore(px, w, h, H, cols, rows) {
    let L0; try { L0 = makeLayout({ cols, rows, levels: [2, 2, 2], rate: 2, tile: 24 }); } catch (e) { return 1e9; }
    const list = []; for (let k = 0; k < L0.N; k++) if (L0.role[k] === ROLE_PILOT && L0.pilA[k]) list.push(k);
    const obs = new Float32Array(L0.N * 3); sampleCells(px, w, h, H, cols, list, obs);
    const cal = calibrate(L0, obs, list); if (!cal) return 1e9;
    let sc = 0; for (const c of cal) sc += c.s2 / Math.max(1e-4, (c.mu[1] - c.mu[0]) ** 2);
    return sc / 3;
  }
  /** 读一张摄像头画面。hint = 之前读到的元信息（同一会话固定不变；单张读不出元信息时用它） */
  function readFrame(px, w, h, hint) {
    const Y = scratch.Y = luma(px, w, h, scratch.Y);
    // 上一帧定位块单格 ≥ 8 像素时，在半分辨率上找定位块（像素少 3/4）；格子小时用全分辨率，免得找不到。时钟线和采样总用全分辨率
    let cands;
    if (scratch.lastM >= 8) {
      const w2 = w >> 1, h2 = h >> 1, Yh = scratch.Yh && scratch.Yh.length === w2 * h2 ? scratch.Yh : (scratch.Yh = new Uint8Array(w2 * h2));
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const i = 2 * y * w + 2 * x; Yh[y * w2 + x] = (Y[i] + Y[i + 1] + Y[i + w] + Y[i + w + 1] + 2) >> 2; }
      const bz = binarize(Yh, w2, h2, scratch.bz); scratch.bz = bz;
      cands = findFinders(bz.B, w2, h2).map(c => ({ x: c.x * 2 + 0.5, y: c.y * 2 + 0.5, m: c.m * 2, n: c.n }));
    } else {
      const bz = binarize(Y, w, h, scratch.bz); scratch.bz = bz;
      cands = findFinders(bz.B, w, h);
    }
    const quads = pickQuads(cands);
    if (!quads.length) { scratch.lastM = 0; return { ok: false, reason: `定位块 ${cands.filter(c => c.n >= 2).length}/4`, frames: [] }; }
    let stage = '时钟线';
    for (const { q, m } of quads) {
      const opts = [];
      for (let rot = 0; rot < 4; rot++) {
        const TL = q[rot], TR = q[(rot + 1) & 3], BR = q[(rot + 2) & 3], BL = q[(rot + 3) & 3];
        const top = readEdge(Y, w, h, TL, TR, m), bot = readEdge(Y, w, h, BL, BR, m), left = readEdge(Y, w, h, TL, BL, m), right = readEdge(Y, w, h, TR, BR, m);
        const pick = (a, b, hv) => a && b ? (a.count === b.count ? a.count : 0) : a ? a.count : b ? b.count : hv || 0;
        const cols = pick(top, bot, hint && hint.cols), rows = pick(left, right, hint && hint.rows);
        if (!cols || !rows) continue;
        const src = [[3.5, 3.5], [cols - 3.5, 3.5], [cols - 3.5, rows - 3.5], [3.5, rows - 3.5]], dst = [[TL.x, TL.y], [TR.x, TR.y], [BR.x, BR.y], [BL.x, BL.y]];
        if (top && top.count === cols) for (const [u, x, y] of top.pts) { src.push([u, 3.5]); dst.push([x, y]); }
        if (bot && bot.count === cols) for (const [u, x, y] of bot.pts) { src.push([u, rows - 3.5]); dst.push([x, y]); }
        if (left && left.count === rows) for (const [v, x, y] of left.pts) { src.push([3.5, v]); dst.push([x, y]); }
        if (right && right.count === rows) for (const [v, x, y] of right.pts) { src.push([cols - 3.5, v]); dst.push([x, y]); }
        let H = fitHomography(src, dst); if (!H) continue;
        // 精修：在预测位置附近找每个时钟格的明暗中心（读不出格数的边也能用上）
        const s2 = [[3.5, 3.5], [cols - 3.5, 3.5], [cols - 3.5, rows - 3.5], [3.5, rows - 3.5]], d2 = dst.slice(0, 4);
        for (const p of [...refineEdge(Y, w, h, H, 3.5, 8, cols - 9, true), ...refineEdge(Y, w, h, H, rows - 3.5, 8, cols - 9, true),
          ...refineEdge(Y, w, h, H, 3.5, 8, rows - 9, false), ...refineEdge(Y, w, h, H, cols - 3.5, 8, rows - 9, false)]) { s2.push([p[0], p[1]]); d2.push([p[2], p[3]]); }
        H = fitHomography(s2, d2) || H;
        opts.push({ cols, rows, H, score: pilotScore(px, w, h, H, cols, rows) });
      }
      opts.sort((a, b) => a.score - b.score);
      for (const o of opts.slice(0, 2)) {
        stage = '元信息';
        const meta = readMeta(px, w, h, o.H, o.cols, o.rows);
        if (meta) { scratch.lastM = m; return readData(px, w, h, o.H, meta); }
        if (hint && hint.cols === o.cols && hint.rows === o.rows && o === opts[0] && (opts.length < 2 || opts[1].score > o.score * 2.5)) {
          scratch.lastM = m; const r = readData(px, w, h, o.H, hint); r.metaFromHint = true; return r;
        }
      }
    }
    return { ok: false, reason: stage, frames: [] };
  }
  function readMeta(px, w, h, H, cols, rows) {
    // 只用 A 类导频（色阶无关），先按 2/2/2 版面取导频位置——导频位置与色阶无关
    let L0;
    try { L0 = makeLayout({ cols, rows, levels: [2, 2, 2], rate: 2, tile: 24 }); } catch (e) { return null; }
    const obs = new Float32Array(L0.N * 3);
    for (let i = 0; i < 2; i++) {
      sampleCells(px, w, h, H, cols, L0.meta[i], obs); sampleCells(px, w, h, H, cols, L0.metaPilots[i], obs);
      const cal = calibrate(L0, obs, L0.metaPilots[i]); if (!cal) continue;
      const llr = cellLLR(cal, obs, L0.meta[i], [2, 2, 2], new Float32Array(META_CELLS * 3));
      const m = unpackMeta(fromBits(decodeBits(llr, META_INFO, 1000), 0, META_BYTES + 4));
      if (m && m.cols === cols && m.rows === rows) return m;
    }
    return null;
  }
  function readData(px, w, h, H, meta) {
    let L;
    try { L = makeLayout(meta); } catch (e) { return { ok: false, reason: '版面参数不支持', frames: [] }; }
    if (L.C !== meta.C) return { ok: false, reason: '版面不一致', frames: [] };
    const obs = scratch.obs && scratch.obs.length === L.N * 3 ? scratch.obs : (scratch.obs = new Float32Array(L.N * 3));
    const all = []; for (let k = 0; k < L.N; k++) if (L.role[k] === ROLE_DATA || L.role[k] === ROLE_PILOT) all.push(k);
    sampleCells(px, w, h, H, L.cols, all, obs);
    const frames = [], sb = sidBytes(meta.sid);
    let okTiles = 0;
    for (let j = 0; j < L.T; j++) {
      const t = L.tiles[j], cal = calibrate(L, obs, t.pilots); if (!cal) continue;
      const llr = cellLLR(cal, obs, t.cells, L.levels, new Float32Array(t.cells.length * L.bpc));
      const bits = L.fec === 'ldpc' ? decodeBitsLdpc(llr, L.nInfo, j + 1) : decodeBits(llr, L.nInfo, j + 1);
      if (!bits) continue;
      const bytes = fromBits(bits, 0, 8 + L.C), dv = new DataView(bytes.buffer);
      const ck = new Uint8Array(8 + L.C); ck.set(sb); ck.set(bytes.subarray(0, 4 + L.C), 4);
      if (crc32n(ck) !== dv.getUint32(4 + L.C)) continue;
      okTiles++;
      frames.push({ v: 5, sid: meta.sid, K: meta.K, len: meta.len, crc: meta.crc, C: L.C, seq: dv.getUint32(0), payload: bytes.slice(4, 4 + L.C) });
    }
    return { ok: true, meta, frames, tiles: L.T, okTiles };
  }

  /** 由「长边格数 + 宽高比 + 色阶 + 码率 + 块大小」得出版面参数（奇数格） */
  function profile({ long = 97, aspect = 1, levels = [2, 2, 2], rate = 2, tile = 24, fec = 'ldpc' }) {
    const odd = x => Math.max(31, Math.min(255, (Math.round(x) | 1)));
    const a = Math.max(1, aspect), cols = odd(long), rows = odd(long / a);
    return { cols, rows, levels, rate, tile, fec };
  }

  const api = { makeLayout, profile, GridFramer, readFrame, LEVELS, RATES, QUIET,
    _: { convEncode, viterbi, codeBits, decodeBits, ldpcCode, ldpcEncode, ldpcDecode, codeBitsLdpc, decodeBitsLdpc, luma, binarize, findFinders, pickQuads, readEdge, fitHomography, unpackMeta, packMeta } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QXG = api;
})(typeof self !== 'undefined' ? self : this);

  })(NS);
  (function (self) {
/* 发送端核心（油猴脚本和 PWA 共用）。依赖：全局 qrcode（qrcode-generator）、QX（codec.js）。 */
(function (root) {
  'use strict';
  const QX = root.QX || (typeof require === 'function' ? require('./codec.js') : null);
  const qrcodeLib = root.qrcode || (typeof require === 'function' ? require('qrcode-generator') : null);
  const { b45enc, crc32n, hex, rowBits } = QX;

  /* ---------- 输入预处理 ---------- */
  async function deflate(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    const buf = await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    return new Uint8Array(buf);
  }
  /** opts: {file|null, text, compress} → {meta, data}。文件按原样发送（不改格式、不缩放）；compress=true 时尝试 deflate，省 ≥5% 才采用 */
  async function prepareInput(opts) {
    let meta, data;
    if (opts.file) {
      const f = opts.file;
      const mime = f.type || 'application/octet-stream', name = f.name || 'file.bin';
      data = new Uint8Array(await f.arrayBuffer());
      meta = { t: 'file', name, mime, z: false, len: data.length };
      if (opts.compress) {
        const zd = await deflate(data); if (zd && zd.length < data.length * 0.95) { data = zd; meta.z = true; }
      }
    } else {
      if (!opts.text) throw new Error('没有输入内容');
      data = new TextEncoder().encode(opts.text);
      meta = { t: 'text', name: 'text.txt', mime: 'text/plain;charset=utf-8', z: false, len: data.length };
      if (opts.compress) { const zd = await deflate(data); if (zd && zd.length < data.length) { data = zd; meta.z = true; } }
    }
    return { meta, data };
  }

  /* ---------- 会话：分块、喷泉码、QR 生成 ---------- */
  const MAX_SEQ_DIGITS = 7;   // 用 9999999 估算 QR 版本：整场播放 QR 尺寸固定，RGB 三层也必定对齐
  class SenderSession {
    /** qr=false：只给彩格码用，不生成 QR（每帧字节由彩格码版面决定） */
    constructor(meta, data, { chunk = 500, ecc = 'L', qr = true } = {}) {
      const mb = new TextEncoder().encode(JSON.stringify(meta));
      const len = 4 + mb.length + data.length;
      const C = Math.max(qr ? 52 : 16, (chunk | 0) & ~3);       // 4 的倍数，冗余帧按 32 位字 XOR
      const K = Math.ceil(len / C);
      if (K > 20000) throw new Error(`数据太大：K=${K} 超过 20000（每块 ${C} 字节，上限约 ${(20000 * C / 1048576).toFixed(1)} MB），请压缩，或${qr ? '调大每帧字节' : '换更快的档位 / 更小的格子，或改用二维码'}`);
      const padded = new Uint8Array(K * C);
      new DataView(padded.buffer).setUint32(0, mb.length); padded.set(mb, 4); padded.set(data, 4 + mb.length);
      Object.assign(this, { meta, len, C, K, ecc, padded,
        crc: hex(crc32n(padded.subarray(0, len)), 8),
        sid: Array.from(crypto.getRandomValues(new Uint8Array(4)), b => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 36]).join(''),
        blocks32: Array.from({ length: K }, (_, i) => new Uint32Array(padded.buffer, i * C, C >>> 2)) });
      if (!qr) { this.type = 0; return; }
      // 固定 QR 版本
      const probe = qrcodeLib(0, ecc);
      probe.addData(this.frameText(0, '9'.repeat(MAX_SEQ_DIGITS)), 'Alphanumeric');
      try { probe.make(); } catch (e) { throw new Error(`每帧 ${C} 字节在纠错 ${ecc} 下装不进一个二维码，请调小每帧字节或降低纠错`); }
      this.type = (probe.getModuleCount() - 17) / 4;
    }
    payload(seq) {
      const { C, K } = this;
      if (seq < K) return this.padded.subarray(seq * C, (seq + 1) * C);
      const bits = rowBits(this.sid, seq, K), out = new Uint32Array(C >>> 2), W = bits.length;
      for (let w = 0; w < W; w++) {
        let x = bits[w];
        while (x) {
          const b = 31 - Math.clz32(x & -x); x &= x - 1;
          const src = this.blocks32[(w << 5) + b];
          for (let j = 0; j < out.length; j++) out[j] ^= src[j];
        }
      }
      return new Uint8Array(out.buffer);
    }
    frameText(seq, seqStr) {
      const p = this.payload(seq);
      return `QX4:${this.sid}:${this.K}:${this.len}:${this.crc}:${seqStr || seq}:${hex(crc32n(p), 8)}:${b45enc(p)}*`;
    }
    /** → {n, bits: Uint8Array(n*n)}，1 = 深色模块 */
    build(seq) {
      let qr;
      try { qr = qrcodeLib(this.type, this.ecc); qr.addData(this.frameText(seq), 'Alphanumeric'); qr.make(); }
      catch (e) { qr = qrcodeLib(0, this.ecc); qr.addData(this.frameText(seq), 'Alphanumeric'); qr.make(); }
      const n = qr.getModuleCount(), bits = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) bits[r * n + c] = qr.isDark(r, c) ? 1 : 0;
      return { n, bits };
    }
  }

  /** 把 1 帧（黑白）或 3 帧（RGB）画进 RGBA 缓冲。返回边长 N（含 4 模块静区） */
  function paint(frames, rgba /* 可选，复用 */) {
    const n = frames[0].n, q = 4, N = n + q * 2;
    const d = rgba && rgba.length === N * N * 4 ? rgba : new Uint8ClampedArray(N * N * 4);
    d.fill(255);
    if (frames.length === 1) {
      const b = frames[0].bits;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (b[r * n + c]) {
        const p = ((r + q) * N + c + q) * 4; d[p] = d[p + 1] = d[p + 2] = 0;
      }
    } else {
      // 每个通道各承载一个 QR：该通道"深"=0，"浅"=255
      for (let ch = 0; ch < 3; ch++) {
        const f = frames[ch]; if (!f || f.n !== n) continue;
        const b = f.bits;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (b[r * n + c]) d[((r + q) * N + c + q) * 4 + ch] = 0;
      }
    }
    return { N, data: d };
  }

  /* ---------- 播放器 ---------- */
  class Player {
    /** canvas：显示用；opts.onShow(label)；opts.box() → {w,h} 可用 CSS 像素（或 opts.size() → 正方形边长）；opts.interval() → ms；
     *  opts.dpr() → 设备像素比（给了就按物理像素整数倍画，125%/150% 缩放的屏幕上每格也一样大） */
    constructor(canvas, opts) {
      this.cv = canvas; this.opts = opts;
      this.small = document.createElement('canvas'); this.sctx = this.small.getContext('2d');
      this.s = null; this.rgb = false; this.grid = null; this.only = null; this.pos = 0;
      this.imgs = new Map(); this.playing = false; this.raf = 0; this.ticks = 0; this.prevT = 0; this.period = 0;
      this._loop = this._loop.bind(this);
    }
    /** grid：彩格码 GridFramer（不传则播 QR） */
    load(session, rgb, grid) { this.stop(); this.s = session; this.rgb = !!rgb; this.grid = grid || null; this.only = null; this.pos = 0; this.imgs.clear(); this.render(); }
    setRGB(rgb) { this.rgb = !!rgb; this.imgs.clear(); this.render(); }
    setOnly(list) { this.only = list && list.length ? list : null; this.pos = 0; this.imgs.clear(); this.render(); }
    get per() { return this.grid ? this.grid.per : this.rgb ? 3 : 1; }
    seqAt(i) { const o = this.only; return o ? o[((i % o.length) + o.length) % o.length] : i; }
    seqsAt(p) { const a = []; for (let k = 0; k < this.per; k++) a.push(this.seqAt(p * this.per + k)); return a; }
    /** 第 p 张图 → {w, h, data: RGBA}（1 像素 = 1 模块/格） */
    image(p) {
      const seqs = this.seqsAt(p);
      if (this.grid) return this.grid.paint(seqs);
      const { N, data } = paint(seqs.map(q => this.s.build(q)));
      return { w: N, h: N, data };
    }
    render() {
      if (!this.s) return;
      const p0 = this.pos, img = this.imgs.get(p0) || this.image(p0);
      this.imgs.clear(); this.imgs.set(p0, img);
      if (this.small.width !== img.w || this.small.height !== img.h) { this.small.width = img.w; this.small.height = img.h; }
      this.sctx.putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
      const box = this.opts.box ? this.opts.box() : (n => ({ w: n, h: n }))(this.opts.size ? this.opts.size() : 520);
      const dpr = (this.opts.dpr && this.opts.dpr()) || 1;
      const cell = Math.max(1, Math.floor(Math.min(box.w * dpr / img.w, box.h * dpr / img.h)));      // 物理像素整数倍放大，边缘锐利
      const W = cell * img.w, H = cell * img.h;
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      if (this.opts.dpr) this.cv.style.width = W / dpr + 'px';
      const ctx = this.cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, 0, 0, W, H);
      const seqs = this.seqsAt(p0), label = this.only ? `补发 ${(p0 * this.per) % this.only.length + 1} / ${this.only.length}` : `第 ${p0 + 1} 张`;
      if (this.opts.onShow) this.opts.onShow(label, seqs);
      // 下一张提前生成，播放时不卡
      setTimeout(() => { if (this.s && this.pos === p0 && !this.imgs.has(p0 + 1)) this.imgs.set(p0 + 1, this.image(p0 + 1)); }, 0);
    }
    step(d) {
      if (!this.s) return;
      this.pos = this.only ? this.pos + d : Math.max(0, this.pos + d);
      this.render();
    }
    restart() { this.pos = 0; this.render(); }
    /* 换帧按屏幕刷新次数计：每张显示 round(间隔 / 刷新周期) 次刷新，不随毫秒累计漂移（漂移会让个别帧变短，引起混帧） */
    _loop(now) {
      if (!this.playing) return;
      if (this.prevT) {
        const d = now - this.prevT;
        if (d > 3 && d < (this.period ? this.period * 1.5 : 40)) this.period = this.period ? this.period * 0.9 + d * 0.1 : d;
      }
      this.prevT = now;
      const ms = this.opts.interval ? this.opts.interval() : 100, n = Math.max(1, Math.round(ms / (this.period || 16.67)));
      if (++this.ticks >= n) { this.ticks = 0; this.step(1); }
      this.raf = requestAnimationFrame(this._loop);
    }
    play() { if (!this.s) return; this.stop(); this.playing = true; this.ticks = 0; this.prevT = 0; this.raf = requestAnimationFrame(this._loop); }
    stop() { this.playing = false; cancelAnimationFrame(this.raf); }
  }

  /** "3,7,10-12" → [3,7,10,11,12]（只保留 < K 的） */
  function parseRanges(s, K) {
    const set = new Set();
    String(s || '').trim().split(/[,\s，、]+/).forEach(p => {
      const m = p.match(/^(\d+)(?:-(\d+))?$/); if (!m) return;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let i = Math.min(a, b); i <= Math.max(a, b) && i < K; i++) set.add(i);
    });
    return [...set].sort((x, y) => x - y);
  }

  const api = { prepareInput, SenderSession, Player, paint, parseRanges };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QXS = api;
})(typeof self !== 'undefined' ? self : this);

  })(NS);
  const QXS = NS.QXS, QXG = NS.QXG;

  /* 固定参数，与网页版一致（仿真选出的最优值，见 docs/SIMULATION.md） */
  const INTERVAL_MS = 66;
  const GRID = { long: 85, levels: [2, 4, 2], rate: 5, tile: 24 };
  const QR = { chunk: 500, ecc: 'L', rgb: true };

  let host = null, root = null, sFile = null, sess = null, sGrid = null, player = null;
  const fmtB = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const $ = id => root.getElementById(id);

  // 面板放在 Shadow DOM 里：所在网页的样式进不来，面板在哪个网站上都长一样
  const CSS = `
  @font-face{font-family:"Doto";font-weight:900;src:url(data:font/woff2;base64,d09GMgABAAAAAA/AAA4AAAABUUQAAA9iAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhYGYD9TVEFUQACEdBEICoWKBIXANwuDHgABNgIkA4MgBCAFhGAHg3kMB1viaTErgo0DQEj+NQD+M5ITGYNZwKf+qRWJZSGSRu/BITKSM4MkOoQ9xiQhgxwSFkIdk4tZCqpdfXi8z1Xcz7UhVZDX3tzzxmJhJd/fQtj/qh/Dk7rFJ0lb4+H/9+u3z30z80XsIaLJpIk2SGLJqmmIvyGePBRobqsTWbThzX9e9gs5pZGB0mEBaeE79Pboj6FNR3Kj+fJj7Z1hG1Z1SPWmlVB0d4iGslBhl5CQiIR+NjzkHxqafiJDA/DCQoav/sR3P7OhhDIRzxFFChZaKXSmhAGp+VagpaBde1MkBVKI2Zt9A7DAzHjbcInviWO7O41VJRQUQlhv1z50mNz6GGDsfwRqdsabwxGMvM1DoR0NHvBqBTJhu5jyeKy+AY43BubDSSb8///ef2ffD01XhUqhG8M4KU06SnuU4dOGp5SyOW/R7j9U+T8KiUe4KISKJfhuTNcxCiHfXIdyzr1JV1iMwShctoOy0nsfZ5FsyIvOfWkCjYAkhBeYlNKO6Qw20qX0ALjy439b/GZYsbY+NdTXpZTVppoTwB7ABgCYfdfMPmi3Z41iITsTs4AOgPgLAXJACLUSOjFjPOZNZ1LA8W8EhNCKVQi0jTogkKIBkJChE4tAJ9a0C2AhCKtuuYaMmDJv2bot/6NjazxPX9P3LLJSVpt35v35cD42n5gvze+NGTu2vbgm12/EmFnLVm3aayk2H3upLNvckffmgzdd8sNkIkBxCYBiJlBd9W11gGrA7x/4fX4v+82vPb/6KSYL/cQ//wlRigpxBoA4EZdA3pXzeg/gDaoSp4uzCR06uesVIVO3RTcabVmDIFkwD1Yh3JwiWDT9PDCpU69Rk05ixEmQJUeeAogSLdp06NJjwJQZcxas+PMWwNUBCmtegkRJQJQqQ5Z8BQoVK1etTZ9JM1ZsO3HqzLlrvnz4cXOIINSyWTEiNaGbUiJaux4hmjEMYJcpqVVWI2nQhl+LVjIkSZEmTJE6Fao0qSmjwYQhI8Ys6SNzYsOWJwcuHAVLkShJsjzZcuTCqdSgRq1WdWK12Ldj154Lqy4pq0dlb8MRDLRhI4YwiaLg4CVAjAJ1X4GbD7i/ADAIIOENTyoplV9RrmRfeelSZ9e/mNCNgtmNr6vEyn0o/LKFude7179tdCr3HVx682PmMIKNLti+Cet95SkgdByMCaZA6I6hhAEgt5nej/DqpukIyyKSSQGANm+ps89Myppz6VzGNcd/ufnjPuFYmcvIb/19Re8XGOfY+3zS5wsDIcv+9YLxxI48YwwvJcyh1srcax0K3sfNfT/QZKD/Gd2Kv/9GBgBQMsvDvxyDNervOevv5ePCFSca6DoKF/U4FiaRbOmpVRhJP7gdnCab9WOh5+QOJOFVHCWW2JlZjWisfKydGKSpiqZVn4INX9KxImC1n2dvIAszG65GAOOefE4R/zMizoJET3o96MSPovF4A0hz2vLFGRP2P5bO8qLP+XniVUrhC/GCtOQ6zHiPis83ArTHQqIDwSA8MY2YBLBa8miK8Pjzv7ky8g5G4pJPVcFCzV+GmUxYz1H5iYgkxsP4LtuaQyNKEeDX8m9ZADAuk9E78Fe+EG8fSVWLkwmlSSTnU3X9ML08VXOkSUyuTciAWsBZNWFENPrM11AK6PnVYt6RT0pf2Ey0C6vrIX9x42s5fgDkK3n+IeZnuoLGT2Y953wvDT/z1cBRgpuiOBdZy69xIZ8J6+HRy7mmHaHFrX94FK+3c6sRJ/HgqhFJ+bWmZPDaoQNsRwkuygmndWinZ/ndvh1CX5/4pJHisy57jA9Mg2gwr6cAqFGT39P/gkBY7PnEq8dJaRWOASN/S9+ZmW4mChY83VtNT3qI9St3hW0UKM25255ZPbCdLryXT7/q+h9+furxc5R7DBYuXQVtZ6d97hgsd8biX8zHDz95eyaA3qTYVYYdNg2AJi14BayHtH287VkmI7J6IBV1IEeXW5zwk38kTcJkvZfGf+JH23vsur3Dlqql4Z1UveHN+jai+BVgqSX2JLcsmD78qjkAqJf7iYozwBQFjA8cLe/V4tMIMOmpCL9RIL9Wa3Ee6idAj82mR5v8S9N1XNwkYdjHr68VUxEoZgp9mKDJ0QrojOkXx2e9pYWf2ruDA7KDHZzSk/lRiDHEjshKz6ZLiem499DuoEXb2SxtVEzYr8TlNoBBwEEgAcf+SYJoJHLdNdDZrn/lqCz+IRZkxyiYLslkzu55F6b/J7zHGDQAbl8ki7V9RRIfHr2jy/XD5DL7Hx6MCxmyTr0Elt8Ofy3T2+rSlPtfLQXa6AUK4FjSZ+ni4NMhX2nqxt6nf+VvePIUdYfUpPVTlW/w0kPM0IP4/FINT4fc7DguXEK9btzsA5lvMpUTDeL4eL4tZpSoCKTBMc3phWf3h6LqdRiTMYagwBJ72zP4qmTfuVJdDyD/ogz0PTKe1kMBIwdet8BvZzxhzORveZEHpdLPLeevMvzra/xDPFmAgrFOkodaVEtq/nkjfPQP0y+hctcPcHDF8WoyqpuLaP/byydZscbnZP7T8iWiLxlwpgFl+x//igL+jVm/4Uu/JgLSEKjq7x8YK31bK3x7r5Zc3uHfpTmV/x5fgJvcrwMdqEGC4LiaHBPjwOP7lNhmTnhDA4raos31Xt4/aaenIPRSzPdZ6JvEXk4IoXmcTKvwzbqqF+VDJRstGr/JNNirIXvXP0v/BLhBZauvpQOW+69EQGMBlj159NX4c0WPvQL8Rd1ZE/6iV7ZmXt8IjbWvSS4pTn8QkGuE4Qkdic+89Tx1tIy9z6LGXgPfcpu+pQHpS61JOcbUg4Hp+zJqSQnFYDm1Leir6WkmHS1oaSLI3o9+AjKATZMMqsJjYB6wkSeq7DXLRQGXC8SsIZbmBHNRPaPj8eSbmPVrNlZnIDDstC3a99GH8XQoshpMuOkz+f3zNbu0VRdCGZoHqBrfWZO/6BAijQp40wKBAx3jxCc0qrbgH116jaMCkTPdaIbp2ZuQG/eQxNHibA/WB5PoBTP/6xvArULI/o3g0GrtmWP3HIfOqQhgZcEQXgF6tqHLkNzVCzBY3QEGwKOHXThpLjM+G9XrmX0IpFbVyjPCgQ5SEfmAojXC6pkL0LWxA7fzZQRS48VbwePUrh6ow2WwP3OATcVgQBVynJSV80EjyNNpLRClBOfv+sNZ6ZEH6QtIguHuGHPIgXyhY4tPRoqa53huoFm/OsUUC0CEyjOr9h1ZpxD9lxZDhi8QUrI6pG64LdICuCqLarY7CgM1MeRordAmAnn71uLOqeZ/pktYHxrULTl8q4fD6KN6i9uBW72mkFI9blqg0rSeuUiw9cdGb/5buHF3MMcHhfXyJSV9d3rgBaPGOjEBUU1LO+jVl+0o6aw/SkC/Yi+etHrMWzf1bMo8EPl6yFrR5Yp7yabNSPAmgu71+qEepbHNusHaXn/kjeAAygUzbjTuC+HKTd+DVQlA7LoRNC0AQWx2SERoCcyfzLH2Jl9+hoNVbzSQN72dsdM95tOoLcV6qYF/KMOZQOfePf/I4Sf/2DrHcQM1WGeU/+/8PREzd9n7OkNHQusnDl09/Yym28vE2mXHxJ2ZdH7qNINWMYbmwXXYREMIk/7YP4BVAxvK1+e3x6cP3VCU7gJxHQzgIHTBeUh6zWgkeIXqg2mG6oxn7DVU+0Vj9WpGgpoBngX+U0GY8VqRbHqUV9sJEspc+t4AkK87Oj818ZMer216WvEaEKGvBlATYnNpmrWjMcdUhx1zDTIccsuTt2M4fQy7g3v6LcmR5dshmgVaL4nFeGceARFDDqY3vVhWgCSCmQTH7PN2kOqd1/++4Bq1F/I3r0ZDtC/U6XVYfkBB/uJ0ZkiR4Qk3TyP5YhhzPwW0cwFiAg3VnKeAGW3AB91pLAH75MraAVw/kxH7pkztyvX//LcQjxFkYwPgFg6Bul/enG29utFMb9GQLpv6pcr/kcHELaL+WR1Y/eVv7mzST/8tzzdC6huSK+IzAVTLiNDQnX51etK5Mzqt26+AYxUARrWlOeLhtMzbPqoBV1tIOKJXYYnd8b+FCHske+5UgAQ5xkNYTmUesaoP0N5FAbMWBKPEa6zeKyg6V4KPm2THpC9XrOJvMRPQt5XvKaZKw9j1TyBhoq+C4Rt7w2p6wyHgbgbsm0HSgIZUCKoJQo0FlAU4cID6No8IlmmBHLSMGz26iqBO/rEEBaLU6XabeNBLeETYdpi1YUgfZNfz5qU1/NuerJ2qjr6oSW9b17eFiI0rzqtGFxxUCNAfBHYzAU8GRCJmzBW64UxxQcWYA93OrVJ8XJzjuAG44k6puvjeweMtPVJdb6ZfcQE3x2uGCGTjMSrMBtrbmnPGjic495PwB2SC/r+wb2Pje9dj1w/giA5BqXw8gLciFkRG7x6/fD0KUOB4qRXrbyj9AL+7uh/4T3dW/kuQVw8zBgAKTI0vjCpBNT7gR3pgFH4haUG/XuKdrVne4LfX62+WV5fc8eec1u/Ir/vY1/SQBdPr1LrjcRfnEIx8R++vM8aLift7N4ziRyzAt2B2AJDKF634yFDl3pPHtUb+fnXI/bo6afbn6sx8628u1bu6rF/v1RXD8q9utpDX1a1EmW1pw236U4J20unq0Kj597FBM1aBoSSiI6AJB8NCw6AJgqAjSUECo6JyQpAoGZ4LBA0CKr8Ug3akqais6NOHSAUjQUGQ0BBgJZcejgqmB0GBbu2OD++l+/cXhoFRUGHbeSLEkB6DX1/1t7n1h8/ixph1iytB+9DoZe9IgeO1f587fzuUgYKVw0GMGDBiQvdvnw8JgQGDvh/7ASgQOLBkNBBHdDQYCAoqiAa+9qFhaz2WLome5LyRSB/yRCwGGOXDzb8fItHv7UfUxAwUo4zQ4NF8CRiv3oUzSWYkm6VKTQp1GmDnLl35WDLlP4j5aF27ceuOLj36DBhCMTLv3gO0Jw3mGDP5L2Q+//CVhWeew3jBkhVrNj6z5QILr6aSg/rhcDnMUSI+4xC5shcvTgI7Dsq4QXxQ7BU5Ai5zV6TWOg6feEhFQUUmY8qSRZBPWF3lSZIELxWcKxljwqRde7wJ8kHDkIbOlx9/CgK88d0PG8lKx26TDFmyLcgkqkevATmClePRqFabI/y2UDKIzTPLVqxac4zbVpXeC1NKnjQpwlicFe4bca8ru0JMhFz5CuRxqhI1UWunKNFifLGpVSyRufE+TruvG9Z8V9rzKu9vVx3x6i/Ao8/JLe/Dlc+e/7zFT+P/7MctAAAA) format("woff2")}
  :host{all:initial}
  .p{--paper:#eceef0;--sheet:#f8f9fa;--ink:#000;--ink2:#565d66;--ink3:#8b929b;--rule:#cdd2d8;--idle:#d6dae0;--bad:#d4373c;
    --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
    position:fixed;z-index:2147483647;top:20px;right:20px;width:420px;max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;
    background:var(--paper);color:var(--ink);border:1px solid var(--rule);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.25);
    font:14px/1.6 var(--sans);-webkit-font-smoothing:antialiased;color-scheme:light}
  @media (prefers-color-scheme:dark){ .p{--paper:#000;--sheet:#121315;--ink:#f2f4f6;--ink2:#a0a7b0;--ink3:#6c737c;--rule:#26292d;--idle:#2a2e33;--bad:#ff6369;color-scheme:dark} }
  .p *{box-sizing:border-box;font:inherit;color:inherit}
  [hidden]{display:none!important}
  :focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  .hd{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px;cursor:move;user-select:none}
  .mark{position:relative;width:18px;height:18px;border:3px solid var(--ink)}
  .mark::after{content:"";position:absolute;inset:3px;background:var(--ink)}
  .ttl{flex:1;font:900 18px/1 "Doto",ui-monospace,monospace}
  .ib{height:32px;min-width:32px;padding:0 10px;display:grid;place-items:center;border:1px solid var(--rule);border-radius:999px;background:var(--sheet);cursor:pointer;font-size:13px;line-height:1}
  .bd{display:grid;gap:12px;padding:0 14px 14px}
  .compose{display:grid;gap:12px}
  .sheet{background:var(--sheet);border:1px solid var(--rule);border-radius:12px}
  .sheet:focus-within{border-color:var(--ink)}
  .p textarea:focus-visible{outline:none}
  textarea{display:block;width:100%;height:110px;resize:vertical;padding:12px 14px 6px;border:0;background:transparent;outline:none;font:14px/1.6 var(--sans)}
  textarea::placeholder{color:var(--ink3)}
  .frow{display:flex;align-items:center;gap:8px;padding:6px 14px 12px}
  .pick{position:relative;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
  .pick input{position:absolute;width:1px;height:1px;opacity:0}
  .fname{font-size:12px;color:var(--ink2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .x{border:0;background:none;color:var(--ink3);cursor:pointer;font-size:12px}
  .opts{border-top:1px solid var(--rule);padding:12px 14px 14px;display:grid;gap:12px}
  .seg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .seg label{position:relative;display:grid;gap:6px;padding:10px 12px;border:1.5px solid var(--rule);border-radius:9px;cursor:pointer;background:var(--paper)}
  .seg input{position:absolute;opacity:0;pointer-events:none}
  .seg b{font-weight:650}
  .seg small{font-size:12px;color:var(--ink2);line-height:1.4}
  .seg label:has(input:checked){border-color:var(--ink)}
  .seg label:has(input:checked)::after{content:"";position:absolute;right:10px;top:12px;width:8px;height:8px;background:var(--ink)}
  .pal{display:flex;flex-wrap:wrap;gap:2px}
  .pal i{width:7px;height:7px;box-shadow:inset 0 0 0 1px var(--rule)}
  .sw{display:flex;align-items:center;gap:10px;cursor:pointer}
  .sw span{flex:1}
  .sw small{display:block;font-size:12px;color:var(--ink2)}
  .sw input{appearance:none;-webkit-appearance:none;width:40px;height:24px;margin:0;border-radius:999px;background:var(--idle);position:relative;cursor:pointer}
  .sw input::before{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--sheet);box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .2s}
  .sw input:checked{background:var(--ink)}
  .sw input:checked::before{transform:translateX(16px)}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border:1.5px solid var(--ink);border-radius:999px;background:transparent;font-weight:600;cursor:pointer}
  .btn:disabled{opacity:.3;pointer-events:none}
  .btn.solid{background:var(--ink);color:var(--paper)}
  .btn.wide{width:100%;min-height:46px}
  .stage{position:relative;background:#fff;border-radius:6px;padding:16px;display:flex;justify-content:center;box-shadow:0 0 0 1px var(--rule)}
  canvas{display:block;max-width:100%;image-rendering:pixelated}
  .bar{display:flex;align-items:center;gap:8px;margin-top:10px}
  .idx{flex:1;font-size:13px;color:var(--ink2)}
  .bar .btn{min-height:36px;padding:0 14px}
  .info{margin-top:10px;font-size:13px}
  .info small{display:block;font-size:12px;color:var(--ink3)}
  .err{color:var(--bad);font-size:12px}
  .err:empty{display:none}
  /* 播放中收起输入区，码在最上面 */
  .p.playing .compose{display:none}
  /* 全屏：白底播放画面，只留底部控制条 */
  .p.full{top:0;right:0;left:0!important;bottom:0;width:auto;max-height:none;border-radius:0;border:0;background:#fff;color-scheme:light}
  .p.full .hd,.p.full .compose,.p.full .info,.p.full .idx{display:none}
  .p.full .bd{height:100%;padding:16px 16px 80px;display:flex;flex-direction:column}
  .p.full .out{flex:1;display:flex;flex-direction:column}
  .p.full .stage{flex:1;align-items:center;box-shadow:none}
  .p.full .bar{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;padding:4px;border-radius:999px;background:#000;margin:0}
  .p.full .bar .btn{border:0;color:#fff;background:transparent}
  `;

  function openPanel() {
    if (host) { const p = $('p'); p.hidden = !p.hidden; return; }
    host = document.createElement('qrstream-sender');
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
    <div class="p" id="p">
      <div class="hd" id="hd"><span class="mark"></span><span class="ttl">QRStream</span>
        <button class="ib" id="qrx-edit" hidden>换内容</button><button class="ib" id="qrx-close" title="关闭（Alt+Q 再打开）" aria-label="关闭">✕</button></div>
      <div class="bd">
        <div class="compose">
          <div class="sheet">
            <textarea id="qrx-text" aria-label="要发送的内容" placeholder="输入或粘贴要发送的文字。截图可以直接粘贴。"></textarea>
            <div class="frow"><label class="pick">选择文件<input type="file" id="qrx-file"></label><span class="fname" id="qrx-file-name"></span><button class="x" id="qrx-clearfile" hidden>移除</button></div>
            <div class="opts">
              <div class="seg" role="radiogroup" aria-label="码型">
                <label><input type="radio" name="k" id="qrx-grid" checked><b>彩格码</b><span class="pal" id="palG"></span><small>最快。用 QRStream 接收</small></label>
                <label><input type="radio" name="k" id="qrx-qr"><b>二维码</b><span class="pal" id="palQ"></span><small>旧版接收端也能读</small></label>
              </div>
              <label class="sw"><span>压缩<small>无损，能省 5% 以上才启用</small></span><input type="checkbox" id="qrx-z" checked></label>
            </div>
          </div>
          <button class="btn solid wide" id="qrx-gen">开始播放</button>
          <div class="err" id="qrx-err"></div>
        </div>
        <div class="out" id="qrx-out" hidden>
          <div class="stage"><canvas id="qrx-cv" width="300" height="300"></canvas></div>
          <div class="bar"><span class="idx" id="qrx-idx"></span><button class="btn" id="qrx-pause">暂停</button><button class="btn solid" id="qrx-full2">全屏</button></div>
          <div class="info" id="qrx-info"></div>
        </div>
      </div>
    </div>`;
    document.documentElement.appendChild(host);
    for (const [id, gl] of [['palG', [0, 85, 170, 255]], ['palQ', [0, 255]]])
      for (const r of [0, 255]) for (const g of gl) for (const b of [0, 255]) { const i = document.createElement('i'); i.style.background = `rgb(${r},${g},${b})`; $(id).appendChild(i); }

    player = new QXS.Player($('qrx-cv'), {
      box: () => $('p').classList.contains('full') ? { w: innerWidth - 24, h: innerHeight - 110 } : { w: 390, h: 390 },
      dpr: () => window.devicePixelRatio || 1,
      interval: () => INTERVAL_MS,
      onShow: label => { $('qrx-idx').textContent = label; },
    });
    const sync = () => { $('qrx-pause').textContent = player.playing ? '暂停' : '继续播放'; };
    const full = on => { if (!sess) return; $('p').classList.toggle('full', on); $('qrx-full2').textContent = on ? '退出全屏' : '全屏'; requestAnimationFrame(() => player.render()); };
    $('qrx-close').onclick = () => { player.stop(); sync(); full(false); $('p').hidden = true; };
    $('qrx-edit').onclick = () => { const on = $('p').classList.toggle('playing'); $('qrx-edit').textContent = on ? '换内容' : '收起'; };
    $('qrx-full2').onclick = () => full(!$('p').classList.contains('full'));
    $('qrx-cv').ondblclick = () => full(!$('p').classList.contains('full'));
    $('qrx-file').onchange = e => setFile(e.target.files[0] || null);
    $('qrx-clearfile').onclick = () => { setFile(null); $('qrx-file').value = ''; };
    $('qrx-text').addEventListener('paste', e => {
      const it = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file');
      if (!it) return;
      e.preventDefault();
      const f = it.getAsFile();
      setFile(new File([f], f.name && f.name !== 'image.png' ? f.name : 'pasted.' + ((f.type.split('/')[1]) || 'bin'), { type: f.type }));
    });
    $('qrx-gen').onclick = () => { $('qrx-err').textContent = ''; generate().catch(err => { $('qrx-err').textContent = err.message; }).finally(() => { $('qrx-gen').disabled = false; sync(); }); };
    $('qrx-pause').onclick = () => { if (!sess) return; player.playing ? player.stop() : player.play(); sync(); };
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && $('p').classList.contains('full')) full(false); });
    dragable($('p'), $('hd'));
  }

  function setFile(f) { sFile = f; $('qrx-file-name').textContent = f ? `${f.name} · ${fmtB(f.size)}` : ''; $('qrx-clearfile').hidden = !f; }
  function showInfo() {
    const per = sGrid ? sGrid.per : 3, secs = (sess.K + 2) / per * INTERVAL_MS / 1000, el = $('qrx-info');
    el.dataset.k = sess.K; el.dataset.per = per; el.dataset.ver = sGrid ? 'grid' : sess.type;
    const t = secs < 60 ? `约 ${Math.max(1, Math.ceil(secs))} 秒` : `约 ${(secs / 60).toFixed(1)} 分钟`;
    el.innerHTML = `${fmtB(sess.meta.len)}${sess.meta.z ? '（已压缩）' : ''}，满速 ${fmtB(1000 / INTERVAL_MS * per * sess.C)}/秒，${t}传完。`
      + `<small>接收端收到任意 ${sess.K + 2} 块就能还原。会话 ${sess.sid}</small>`;
  }

  function dragable(box, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || box.classList.contains('full')) return;
      on = true; sx = e.clientX; sy = e.clientY; const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault();
    });
    window.addEventListener('mousemove', e => { if (!on) return;
      box.style.left = ox + e.clientX - sx + 'px'; box.style.top = oy + e.clientY - sy + 'px'; box.style.right = 'auto'; });
    window.addEventListener('mouseup', () => { on = false; });
  }

  async function generate() {
    player.stop();
    $('qrx-gen').disabled = true;
    await new Promise(r => setTimeout(r, 0));
    const { meta, data } = await QXS.prepareInput({ file: sFile, text: $('qrx-text').value, compress: $('qrx-z').checked });
    let s, grid = null;
    if ($('qrx-grid').checked) {
      const L = QXG.makeLayout(QXG.profile(GRID));
      s = new QXS.SenderSession(meta, data, { chunk: L.C, qr: false });
      grid = new QXG.GridFramer(s, L);
    } else s = new QXS.SenderSession(meta, data, { chunk: QR.chunk, ecc: QR.ecc });
    const per = grid ? grid.per : 3, mins = (s.K + 2) / per * INTERVAL_MS / 60000;
    if (mins > 3 && !confirm(`内容较大，至少需要约 ${mins.toFixed(1)} 分钟。继续？`)) return;
    sess = s; sGrid = grid;
    $('qrx-out').hidden = false; $('p').classList.add('playing'); $('qrx-edit').hidden = false; $('qrx-edit').textContent = '换内容';
    player.load(sess, QR.rgb, grid);
    showInfo();
    player.play();
  }

  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('打开 QRStream 发送面板 (Alt+Q)', openPanel);
  window.addEventListener('keydown', e => { if (e.altKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ')) { e.preventDefault(); openPanel(); } });
})();
/* jshint ignore:end */
