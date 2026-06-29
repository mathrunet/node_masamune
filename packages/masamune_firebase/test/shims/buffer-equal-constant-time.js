'use strict';
const Buffer = require('buffer').Buffer;

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  let c = 0;
  for (let i = 0; i < a.length; i++) c |= a[i] ^ b[i];
  return c === 0;
}

bufferEq.install = function () {
  Buffer.prototype.equal = function (that) {
    return bufferEq(this, that);
  };
};

bufferEq.restore = function () {
  delete Buffer.prototype.equal;
};

module.exports = bufferEq;
