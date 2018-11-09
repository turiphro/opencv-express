global.cv = require('/usr/lib/node_modules/opencv4nodejs');

const { decodeFromBase64, encodeJpgBase64 } = require('./imgcodecs');
const detectFaces = require('./faceDetection');
const detectFingers = require('./fingerDetection');
const {
  detectKeyPointsORB,
  detectKeyPointsSURF,
  detectKeyPointsSIFT
} = require('./featureDetection');

module.exports = {
  decodeFromBase64,
  encodeJpgBase64,
  detectFaces,
  detectFingers,
  detectKeyPointsORB,
  detectKeyPointsSURF,
  detectKeyPointsSIFT
};
