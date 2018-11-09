module.exports = (img) => {

  function getTranscription(numberOfFingers) {
      if (numberOfFingers == 0) {
          return "turn of light";
      } else {
          return "turn on light";
      }
  }

  var results = {
      annotated: img.copy(),
      numOfFingers: 0,
      transcription: getTranscription(0),
  };


  /*
   * Step 1: remove faces
   */
  const classifier = new cv.CascadeClassifier(cv.HAAR_FRONTALFACE_ALT2);

  const detection = classifier.detectMultiScale(img.bgrToGray());

  // remove faces
  detection.objects.forEach((rect, i) => {
    const black = new cv.Vec(0, 0, 0);
    img.drawRectangle(
      new cv.Point(rect.x, rect.y),
      new cv.Point(rect.x + rect.width, rect.y + rect.height),
      { color: black, thickness: -1 }
    );
  });


  /*
   * Step 2: find hand contour
   * Based on: https://github.com/justadudewhohacks/opencv4nodejs/blob/master/examples/handGestureRecognition0.js
   */

  // segmenting by skin color (has to be adjusted)
  const skinColorUpper = hue => new cv.Vec(hue, 0.80 * 255, 0.99 * 255);
  const skinColorLower = hue => new cv.Vec(hue, 0.10 * 255, 0.05 * 255);

  const makeHandMask = (img) => {
	// filter by skin color
	const imgHLS = img.cvtColor(cv.COLOR_BGR2HLS);
	const rangeMask = imgHLS.inRange(skinColorLower(0), skinColorUpper(15)).or(
	    imgHLS.inRange(skinColorLower(160), skinColorUpper(180)));

	// remove noise
	const blurred = rangeMask.blur(new cv.Size(10, 10));
	const thresholded = blurred.threshold(200, 255, cv.THRESH_BINARY);

	return thresholded;
  };

  const getHandContour = (handMask) => {
	const mode = cv.RETR_EXTERNAL;
	const method = cv.CHAIN_APPROX_SIMPLE;
	const contours = handMask.findContours(mode, method);
	// largest contour
	return contours.sort((c0, c1) => c1.area - c0.area)[0];
  };

  // returns distance of two points
  const ptDist = (pt1, pt2) => pt1.sub(pt2).norm();

  // returns center of all points
  const getCenterPt = pts => pts.reduce(
	  (sum, pt) => sum.add(pt),
	  new cv.Point(0, 0)
	).div(pts.length);

  // get the polygon from a contours hull such that there
  // will be only a single hull point for a local neighborhood
  const getRoughHull = (contour, maxDist) => {
	// get hull indices and hull points
	const hullIndices = contour.convexHullIndices();
	const contourPoints = contour.getPoints();
	const hullPointsWithIdx = hullIndices.map(idx => ({
	  pt: contourPoints[idx],
	  contourIdx: idx
	}));
	const hullPoints = hullPointsWithIdx.map(ptWithIdx => ptWithIdx.pt);

	// group all points in local neighborhood
	const ptsBelongToSameCluster = (pt1, pt2) => ptDist(pt1, pt2) < maxDist;
	const { labels } = cv.partition(hullPoints, ptsBelongToSameCluster);
	const pointsByLabel = new Map();
	labels.forEach(l => pointsByLabel.set(l, []));
	hullPointsWithIdx.forEach((ptWithIdx, i) => {
	  const label = labels[i];
	  pointsByLabel.get(label).push(ptWithIdx);
	});

	// map points in local neighborhood to most central point
	const getMostCentralPoint = (pointGroup) => {
	  // find center
	  const center = getCenterPt(pointGroup.map(ptWithIdx => ptWithIdx.pt));
	  // sort ascending by distance to center
	  return pointGroup.sort(
		(ptWithIdx1, ptWithIdx2) => ptDist(ptWithIdx1.pt, center) - ptDist(ptWithIdx2.pt, center)
	  )[0];
	};
	const pointGroups = Array.from(pointsByLabel.values());
	// return contour indeces of most central points
	return pointGroups.map(getMostCentralPoint).map(ptWithIdx => ptWithIdx.contourIdx);
  };

  const getHullDefectVertices = (handContour, hullIndices) => {
	const defects = handContour.convexityDefects(hullIndices);
	const handContourPoints = handContour.getPoints();

	// get neighbor defect points of each hull point
	const hullPointDefectNeighbors = new Map(hullIndices.map(idx => [idx, []]));
	defects.forEach((defect) => {
	  const startPointIdx = defect.at(0);
	  const endPointIdx = defect.at(1);
	  const defectPointIdx = defect.at(2);
	  hullPointDefectNeighbors.get(startPointIdx).push(defectPointIdx);
	  hullPointDefectNeighbors.get(endPointIdx).push(defectPointIdx);
	});

	return Array.from(hullPointDefectNeighbors.keys())
	  // only consider hull points that have 2 neighbor defects
	  .filter(hullIndex => hullPointDefectNeighbors.get(hullIndex).length > 1)
	  // return vertex points
	  .map((hullIndex) => {
		const defectNeighborsIdx = hullPointDefectNeighbors.get(hullIndex);
		return ({
		  pt: handContourPoints[hullIndex],
		  d1: handContourPoints[defectNeighborsIdx[0]],
		  d2: handContourPoints[defectNeighborsIdx[1]]
		});
	  });
  };

  const filterVerticesByAngle = (vertices, maxAngleDeg) =>
	vertices.filter((v) => {
	  const sq = x => x * x;
	  const a = v.d1.sub(v.d2).norm();
	  const b = v.pt.sub(v.d1).norm();
	  const c = v.pt.sub(v.d2).norm();
	  const angleDeg = Math.acos(((sq(b) + sq(c)) - sq(a)) / (2 * b * c)) * (180 / Math.PI);
	  return angleDeg < maxAngleDeg;
	});

  const filterVerticesByHeight = (vertices, minHeight) =>
	vertices.filter((v) => {
	  return v.pt.y < minHeight;
	});

  const blue = new cv.Vec(255, 0, 0);
  const green = new cv.Vec(0, 255, 0);
  const red = new cv.Vec(0, 0, 255);

  // main
  const resizedImg = img.resizeToMax(640);

  const handMask = makeHandMask(resizedImg);
  results.mask = handMask;
  
  const handContour = getHandContour(handMask);
  if (!handContour) {
    return results;
  }
  
  const maxPointDist = 25;
  const hullIndices = getRoughHull(handContour, maxPointDist);
  
  // get defect points of hull to contour and return vertices
  // of each hull point to its defect points
  const vertices = getHullDefectVertices(handContour, hullIndices);
  
  // fingertip points are those which have a sharp angle to its defect points
  const maxAngleDeg = 60;
  const verticesWithValidAngle = filterVerticesByAngle(vertices, maxAngleDeg);

  // filter results from bottom 50% (usually false positives)
  var maxHeight = 0;
  var minHeight = 1000;
  vertices.forEach((v) => {
      maxHeight = Math.max(maxHeight, v.pt.y);
      minHeight = Math.min(minHeight, v.pt.y);
  });
  //console.log("MIN " + minHeight + ", MAX " + maxHeight);
  const heightThreshold = minHeight + 0.5 * (maxHeight - minHeight);
  const verticesWithValidAngleTop = filterVerticesByHeight(verticesWithValidAngle, heightThreshold);
  
  const annotated = resizedImg.copy();
  // draw bounding box and center line
  annotated.drawContours(
    [handContour],
    blue,
    { thickness: 2 }
  );
  
  // draw points and vertices
  verticesWithValidAngleTop.forEach((v) => {
    annotated.drawLine( v.pt, v.d1, { color: green, thickness: 2 });
    annotated.drawLine( v.pt, v.d2, { color: green, thickness: 2 });
    annotated.drawEllipse( new cv.RotatedRect(v.pt, new cv.Size(20, 20), 0), { color: red, thickness: 2 });
    annotated.drawEllipse( new cv.RotatedRect(v.pt, new cv.Size(20, 20), 0), { color: red, thickness: 2 });
  });

  // display detection result
  const numFingersUp = verticesWithValidAngleTop.length;
  const numFingersUpUnfiltered = verticesWithValidAngle.length;
  annotated.drawRectangle(
    new cv.Point(10, 10),
    new cv.Point(70, 70),
    { color: green, thickness: 2 }
  );
  
  var fontScale = 2;
  annotated.putText(
    String(numFingersUp),
    new cv.Point(20, 60),
    cv.FONT_ITALIC,
    fontScale,
    { color: green, thickness: 2 }
  );
  fontScale = 0.8;
  annotated.putText(
    String(numFingersUpUnfiltered),
    new cv.Point(50, 70),
    cv.FONT_ITALIC,
    fontScale,
    { color: green, thickness: 1 }
  );
  
  const { rows, cols } = annotated;
  const sideBySide = new cv.Mat(rows, cols * 2, cv.CV_8UC3);
  annotated.copyTo(sideBySide.getRegion(new cv.Rect(0, 0, cols, rows)));
  resizedImg.copyTo(sideBySide.getRegion(new cv.Rect(cols, 0, cols, rows)));

  results.annotation = annotated;
  results.numberOfFingers = numFingersUp;
  results.numberOfFingersUnfiltered = numFingersUpUnfiltered;
  results.transcription = getTranscription(numFingersUp);

  return results;
};
