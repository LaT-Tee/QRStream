// ==UserScript==
// @name         QRStream Sender
// @namespace    qrstream.sender
// @version      1.0.0
// @license      MIT
// @description  Alt+Q 打开面板。喷泉码 + 32 位帧校验 + 固定 QR 版本 + 可选 RGB 三通道（×3）。依赖全部内联，离线可用
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* 本脚本内联了 qrcode-generator（MIT, https://github.com/kazuhikoarase/qrcode-generator）
 *
 * 协议 QX4（接收端兼容 QX3）：
 *   QX4:<SID>:<K>:<LEN>:<CRC32>:<SEQ>:<FCK32>:<BASE45载荷>*
 *   SEQ<K 系统帧；SEQ>=K 冗余帧 = rowBits(SID,SEQ,K) 选中源块的 XOR（GF(2) 随机线性喷泉码）
 *   RGB 模式：一张图的 R/G/B 三个通道各放一个 QR（3 个连续 SEQ），版本固定所以三层完全对齐
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
      let bits;
      if (seq < K) { bits = new Uint32Array(W); bits[seq >>> 5] = 1 << (seq & 31); }
      else bits = rowBits(this.sid, seq, K);
      const data = new Uint32Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.length));
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
            return 'useful';
          }
          if (p.bits) for (let j = w; j < W; j++) bits[j] ^= p.bits[j];
          else bits[w] = x & (x - 1);
          const pd = p.data;
          for (let j = 0; j < CW; j++) data[j] ^= pd[j];
        }
      }
      return 'useless';
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
    constructor(meta, data, { chunk = 500, ecc = 'L' } = {}) {
      const mb = new TextEncoder().encode(JSON.stringify(meta));
      const len = 4 + mb.length + data.length;
      const C = Math.max(52, (chunk | 0) & ~3);                  // 4 的倍数，冗余帧按 32 位字 XOR
      const K = Math.ceil(len / C);
      if (K > 20000) throw new Error(`数据太大：K=${K} 超过 20000，请压缩或调大每帧字节`);
      const padded = new Uint8Array(K * C);
      new DataView(padded.buffer).setUint32(0, mb.length); padded.set(mb, 4); padded.set(data, 4 + mb.length);
      Object.assign(this, { meta, len, C, K, ecc, padded,
        crc: hex(crc32n(padded.subarray(0, len)), 8),
        sid: Array.from(crypto.getRandomValues(new Uint8Array(4)), b => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 36]).join(''),
        blocks32: Array.from({ length: K }, (_, i) => new Uint32Array(padded.buffer, i * C, C >>> 2)) });
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
    /** canvas：显示用；opts.onShow(label)；opts.size() → 目标像素；opts.interval() → ms */
    constructor(canvas, opts) {
      this.cv = canvas; this.opts = opts;
      this.small = document.createElement('canvas'); this.sctx = this.small.getContext('2d');
      this.s = null; this.rgb = false; this.only = null; this.pos = 0;
      this.cache = new Map(); this.playing = false; this.raf = 0; this.last = 0; this.img = null;
      this._loop = this._loop.bind(this);
    }
    load(session, rgb) { this.stop(); this.s = session; this.rgb = !!rgb; this.only = null; this.pos = 0; this.cache.clear(); this.render(); }
    setRGB(rgb) { this.rgb = !!rgb; this.cache.clear(); this.render(); }
    setOnly(list) { this.only = list && list.length ? list : null; this.pos = 0; this.cache.clear(); this.render(); }
    get per() { return this.rgb ? 3 : 1; }
    seqAt(i) { const o = this.only; return o ? o[((i % o.length) + o.length) % o.length] : i; }
    seqsAt(p) { const a = []; for (let k = 0; k < this.per; k++) a.push(this.seqAt(p * this.per + k)); return a; }
    frame(seq) { let f = this.cache.get(seq); if (!f) { f = this.s.build(seq); this.cache.set(seq, f); } return f; }
    prefetch() {
      const want = new Set([...this.seqsAt(this.pos), ...this.seqsAt(this.pos + 1)]);
      for (const k of this.cache.keys()) if (!want.has(k)) this.cache.delete(k);
      const nx = this.seqsAt(this.pos + 1), p0 = this.pos;
      setTimeout(() => { if (this.s && this.pos === p0) for (const q of nx) if (!this.cache.has(q)) this.cache.set(q, this.s.build(q)); }, 0);
    }
    render() {
      if (!this.s) return;
      const seqs = this.seqsAt(this.pos);
      const { N, data } = paint(seqs.map(q => this.frame(q)), this.img && this.img.data);
      if (this.small.width !== N) { this.small.width = this.small.height = N; this.img = null; }
      if (!this.img || this.img.data !== data) this.img = new ImageData(data, N, N);
      this.sctx.putImageData(this.img, 0, 0);
      const want = this.opts.size ? this.opts.size() : 520;
      const cell = Math.max(1, Math.floor(want / N)), size = cell * N;     // 整数倍放大，边缘锐利
      if (this.cv.width !== size) { this.cv.width = size; this.cv.height = size; }
      const ctx = this.cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, 0, 0, size, size);
      const K = this.s.K, lab = q => q < K ? `源${q + 1}` : `冗${q - K + 1}`;
      let label;
      if (this.only) label = `补发 ${seqs.join(',')}（${(this.pos * this.per) % this.only.length + 1}/${this.only.length}）`;
      else if (this.per === 1) label = seqs[0] < K ? `源帧 ${seqs[0] + 1} / ${K}` : `冗余帧 #${seqs[0] - K + 1}`;
      else label = `RGB：${seqs.map(lab).join(' · ')}　（源 ${K} 块）`;
      if (this.opts.onShow) this.opts.onShow(label, seqs);
      this.prefetch();
    }
    step(d) {
      if (!this.s) return;
      this.pos = this.only ? this.pos + d : Math.max(0, this.pos + d);
      this.render();
    }
    restart() { this.pos = 0; this.render(); }
    _loop(now) {
      if (!this.playing) return;
      const ms = this.opts.interval ? this.opts.interval() : 100;
      if (now - this.last >= ms - 4) { this.last = now - this.last < ms * 2 ? this.last + ms : now; this.step(1); }
      this.raf = requestAnimationFrame(this._loop);
    }
    play() { if (!this.s) return; this.stop(); this.playing = true; this.last = performance.now(); this.raf = requestAnimationFrame(this._loop); }
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
  const QXS = NS.QXS;

  let root = null, sFile = null, sess = null, player = null;

  function css() { return `
    #qrx-root{position:fixed;z-index:2147483647;top:20px;right:20px;width:580px;max-height:calc(100vh - 40px);overflow:auto;
      background:#fff;color:#222;border:1px solid #888;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);
      font:13px/1.5 "Segoe UI","Meiryo","Microsoft YaHei",sans-serif;padding:10px}
    #qrx-root *{box-sizing:border-box;font:inherit;color:inherit}
    #qrx-root h3{margin:0 0 6px;font-weight:bold;font-size:15px;display:flex;justify-content:space-between;cursor:move}
    #qrx-root textarea{width:100%;height:100px;border:1px solid #aaa;border-radius:4px;padding:4px;font-family:Consolas,monospace;background:#fff}
    #qrx-root .row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:6px 0}
    #qrx-root input[type=number]{width:70px;border:1px solid #aaa;border-radius:3px;padding:1px 3px;background:#fff}
    #qrx-root input[type=text]{border:1px solid #aaa;border-radius:3px;padding:1px 3px;background:#fff}
    #qrx-root select{border:1px solid #aaa;background:#fff}
    #qrx-root button{border:1px solid #666;background:#f2f2f2;border-radius:4px;padding:2px 10px;cursor:pointer}
    #qrx-root button.primary{background:#0a64d8;color:#fff;border-color:#0a64d8}
    #qrx-root canvas#qrx-cv{display:block;margin:6px auto;background:#fff;max-width:100%;image-rendering:pixelated}
    #qrx-root .info{font-size:12px;color:#555;white-space:pre-wrap}
    #qrx-root .big{text-align:center;font-size:16px;font-weight:bold}
    #qrx-root #qrx-file-name{color:#0a64d8}
    #qrx-root.qrx-full{top:0;right:0;left:0;bottom:0;width:auto;max-height:none;border-radius:0}
    #qrx-root.qrx-full .qrx-ctl{display:none}
    #qrx-root.qrx-full canvas#qrx-cv{max-height:calc(100vh - 80px);width:auto}
  `; }
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  const $ = id => root.querySelector('#' + id);
  const fmtB = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

  function openPanel() {
    if (root) { root.style.display = root.style.display === 'none' ? '' : 'none'; return; }
    const style = document.createElement('style'); style.textContent = css(); document.head.appendChild(style);
    root = el(`
    <div id="qrx-root">
      <h3><span>📤 QRStream Sender</span><span><button id="qrx-full" title="全屏">⛶</button> <button id="qrx-close">×</button></span></h3>
      <div class="qrx-ctl">
        <textarea id="qrx-text" placeholder="输入文本（支持换行）……&#10;或选择文件 / 在此 Ctrl+V 粘贴图片"></textarea>
        <div class="row"><input type="file" id="qrx-file"><span id="qrx-file-name"></span><button id="qrx-clearfile">清除文件</button></div>
        <div class="row">
          <label>每帧字节 <input type="number" id="qrx-chunk" value="500" min="52" max="1900" step="4"></label>
          <label>纠错 <select id="qrx-ecc"><option selected>L</option><option>M</option><option>Q</option><option>H</option></select></label>
          <label>间隔ms <input type="number" id="qrx-ms" value="50" min="34" step="2" title="接收端摄像头约 30 帧/秒（33ms），低于 34 没有意义"></label>
          <label>尺寸px <input type="number" id="qrx-px" value="520" min="200" step="40"></label>
        </div>
        <div class="row">
          <label><input type="checkbox" id="qrx-rgb" checked> RGB 三通道（×3）</label>
          <label><input type="checkbox" id="qrx-z" checked> 压缩（deflate，原样无损）</label>
        </div>
        <div class="row">
          <button class="primary" id="qrx-gen">生成并播放</button>
          <button id="qrx-pause">▶ 播放</button>
          <button id="qrx-prev">◀</button><button id="qrx-next">▶</button>
          <button id="qrx-restart">⏮ 从头</button>
          <label>只播帧 <input type="text" id="qrx-only" placeholder="如 3,7,10-12" style="width:110px"></label>
          <button id="qrx-apply">应用</button>
        </div>
      </div>
      <canvas id="qrx-cv" width="520" height="520"></canvas>
      <div class="big" id="qrx-idx"></div>
      <div class="info" id="qrx-info"></div>
    </div>`);
    document.body.appendChild(root);

    player = new QXS.Player($('qrx-cv'), {
      size: () => root.classList.contains('qrx-full') ? Math.min(innerWidth - 20, innerHeight - 80) : (+$('qrx-px').value || 520),
      interval: () => +$('qrx-ms').value || 50,
      onShow: label => { $('qrx-idx').textContent = label; },
    });
    const sync = () => { $('qrx-pause').textContent = player.playing ? '⏸ 暂停' : '▶ 播放'; };
    $('qrx-close').onclick = () => { player.stop(); sync(); root.style.display = 'none'; };
    $('qrx-full').onclick = () => { root.classList.toggle('qrx-full'); player.render(); };
    $('qrx-file').onchange = e => setFile(e.target.files[0] || null);
    $('qrx-clearfile').onclick = () => { setFile(null); $('qrx-file').value = ''; };
    $('qrx-text').addEventListener('paste', e => {
      const it = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file');
      if (!it) return;
      e.preventDefault();
      const f = it.getAsFile();
      setFile(new File([f], f.name && f.name !== 'image.png' ? f.name : 'pasted.' + ((f.type.split('/')[1]) || 'bin'), { type: f.type }));
    });
    $('qrx-gen').onclick = () => generate().catch(err => { info('❌ ' + err.message); }).finally(() => { $('qrx-gen').disabled = false; sync(); });
    $('qrx-pause').onclick = () => { if (!sess) return; player.playing ? player.stop() : player.play(); sync(); };
    $('qrx-prev').onclick = () => { player.stop(); sync(); player.step(-1); };
    $('qrx-next').onclick = () => { player.stop(); sync(); player.step(1); };
    $('qrx-restart').onclick = () => { if (!sess) return; player.setOnly(null); $('qrx-only').value = ''; player.restart(); };
    $('qrx-apply').onclick = () => { if (!sess) return; const l = QXS.parseRanges($('qrx-only').value, sess.K); player.setOnly(l.length ? l : null); };
    $('qrx-rgb').onchange = () => { if (sess) { player.setRGB($('qrx-rgb').checked); showInfo(); } };
    $('qrx-px').onchange = () => player.render();
    $('qrx-cv').ondblclick = () => { root.classList.toggle('qrx-full'); player.render(); };
    dragable(root, root.querySelector('h3'));
  }

  function setFile(f) { sFile = f; $('qrx-file-name').textContent = f ? `📎 ${f.name}（${fmtB(f.size)}）` : ''; }
  function info(s) { $('qrx-info').textContent = s; }
  function showInfo() {
    const ms = +$('qrx-ms').value || 50, per = $('qrx-rgb').checked ? 3 : 1, fps = 1000 / ms;
    info(`会话: ${sess.sid}　类型: ${sess.meta.t}${sess.meta.z ? '(已压缩)' : ''}　原始 ${fmtB(sess.meta.len)} → 包 ${fmtB(sess.len)}
源块 K=${sess.K}　QR v${sess.type}（固定）　纠错 ${sess.ecc}　${fps.toFixed(1)} 码/秒${per === 3 ? `（RGB ×3 = ${(fps * 3).toFixed(1)} 帧/秒）` : ''}
接收端收到任意约 ${sess.K + 2} 帧即可还原（理想约 ${((sess.K + 2) / per / fps).toFixed(1)} 秒），漏帧无需等下一轮`);
  }

  function dragable(box, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || box.classList.contains('qrx-full')) return;
      on = true; sx = e.clientX; sy = e.clientY; const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault();
    });
    window.addEventListener('mousemove', e => { if (!on) return;
      box.style.left = ox + e.clientX - sx + 'px'; box.style.top = oy + e.clientY - sy + 'px'; box.style.right = 'auto'; });
    window.addEventListener('mouseup', () => on = false);
  }

  async function generate() {
    player.stop();
    $('qrx-gen').disabled = true;
    info('处理中…'); await new Promise(r => setTimeout(r, 0));
    const { meta, data } = await QXS.prepareInput({ file: sFile, text: $('qrx-text').value, compress: $('qrx-z').checked });
    const s = new QXS.SenderSession(meta, data, { chunk: +$('qrx-chunk').value || 500, ecc: $('qrx-ecc').value });
    const ms = +$('qrx-ms').value || 50;
    if (s.K > 3000 && !confirm(`共 ${s.K} 帧，至少约 ${(s.K * ms / 60000 / ($('qrx-rgb').checked ? 3 : 1)).toFixed(1)} 分钟。建议先压缩图片/调低质量。继续？`)) { info('已取消'); return; }
    sess = s; $('qrx-chunk').value = s.C; $('qrx-only').value = '';
    player.load(sess, $('qrx-rgb').checked);
    showInfo();
    player.play();
  }

  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('打开 QRStream Sender (Alt+Q)', openPanel);
  window.addEventListener('keydown', e => { if (e.altKey && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); openPanel(); } });
})();
