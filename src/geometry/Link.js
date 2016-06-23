import _ from "lodash";
import Point from "./Point";

let defaultConfig = {
	type: "direct",
	showGauge: false,
	orthogonal: false
};

let linkTypes = {};

class Link {
	constructor(terminalVisual, shapeConfig = {}, startMarker = null, endMarker = null) {
		this.start = terminalVisual[0].point;
		this.end = terminalVisual[1].point;
		this.startNormal = terminalVisual[0].direction;
		this.endNormal = terminalVisual[1].direction;
		this.startMarker = startMarker;
		this.endMarker = endMarker;
		_.assign(this, shapeConfig);
	}

	render(view) {
		return view.renderLink(this);
	}

	get points() { return null; }
	get controlPts() { return null; }

	/**
	 *
	 * Return the total length of this connection, in pixels.
	 */
	getLength() {
		if (!_.isUndefined(this.length)) return this.length;

		var points = this.points;
		var i, l = 0;
		for (i = 0; i < points.length - 1; i++)
			l += points[i].distance(points[i+1]);
		return this.length = l;
	}

	/**
	 * Calculate the position where to put modifiers or label..
	 *
	 * @param geometry: defines how far along the edge should the point be placed.
	 * @return *[] the relative position.
	 */
	getRelativePosition(geometry) {
		var p = geometry.x, l = this.getLength();
		if (_.isString(p)) {
			if (/%$/.test(p)) {
				p = s(p).strLeft('%').toNumber() / 100;
			} else if (/px$/.test(p)) {
				p = s(p).strLeft('px').toNumber();
			}
		}
		if (p >= -1 && p <= 1) p *= l;
		if (p < 0) p = l + p;
		if (p > l) p = l;

		var points = this.getPoints(), d, point, dir;
		for (var i = 0; i < points.length - 1; i++) {
			d = points[i].distance(points[i+1]);
			if (p <= d) {
				// we've located the line segment.
				point = points[i].clone();
				dir = point.getDirection(points[i+1]);
				point.translate(dir.getScaled(p));
				break;
			}
			p -= d;
		}

		// return the last point.
		if (!point)
			point = points[points.length - 1];
		return [point.x + geometry.offsetX, point.y + geometry.offsetY];
	}

	toString() {
		return 'Link';
	}

	static getLink(terminalVisual, shapeConfig = {}, startMarker = null, endMarker = null) {
		shapeConfig = _.defaultsDeep(shapeConfig, defaultConfig);
		let linkClass = linkTypes[shapeConfig.type];
		if (linkClass)
			return new linkClass(terminalVisual, shapeConfig, startMarker, endMarker);
		console.log('link type not supported: ' + shapeConfig.type);
		return null;
	}
}

class DirectLink extends Link {
	get points() {
		return [this.start, this.end];
	}
}

class BezierLink extends Link {
	get points() {
		return [this.start, this.end];
	}

	get controlPts() {
		let s = this.points[0], e = this.points[1];
		let pts = [];
		pts[0] = null;
		pts[1] = [];
		if (this.startNormal.x == 0) {
			pts[1][0] = new Point(s.x, (s.y + e.y)/2);
		}
		else {
			pts[1][0] = new Point((s.x + e.x)/2, s.y);
		}
		if (this.endNormal.x == 0) {
			pts[1][1] = new Point(e.x, (s.y + e.y)/2);
		}
		else {
			pts[1][1] = new Point((s.x + e.x)/2, e.y);
		}
		return pts;
	}
}

class EntityRelations extends Link {

}


class Manhattan extends Link {
	constructor(terminalVisual, shapeConfig, startMarker, endMarker) {
		shapeConfig = _.defaults(shapeConfig, {
			MIN_BUFFER: 10,
			autoRoute: false,
			maxChannelWidth: 100
		});
		super(terminalVisual, shapeConfig, startMarker, endMarker);
	}

	get points() {
		let pos = Manhattan.routeInternal(this.start, this.end, this.startNormal, this.endNormal, this.MIN_BUFFER);
		pos = Manhattan.processPositions(this.start, this.end, pos, this.startNormal.x!=0);
		if (this.autoRoute) {
			this._mergeSegments(pos);
			var boxes = [], node, startBox, endBox;
			var container = edge.source.getCommonAncestor(edge.target);
			var childNodes = container.getDescendants();
			var index = 0;
			for (var i = 0; i < childNodes.length; i++) {
				node = childNodes[i];
				// Do not include source or target ancestors in routing.
				if (node.excludeFromRouting(edge) || node.isAncestor(edge.source) || node.isAncestor(edge.target)) continue;
				if (node == edge.source)
				startBox = index;
				if (node == edge.target)
				endBox = index;
				boxes.push(node.getBounds(document));
				index++;
			}
			if (boxes.length > 1)
				this.autoRoute(pos, container.getBounds(document), boxes, startBox, endBox);
		}
		this._mergeSegments(pos);
		return pos;
	}

	get controlPts() {

	}

	/**
	 * Make a route based on the start, end and startNormal and endNormal
	 * None of the parameters can be null
	 * TODO: This method could use some improvement...
	 */
	static routeInternal(start, end, startNormal, endNormal, buffer) {
		var direction = start.getDirection(end);
		var average = start.getMidPoint(end);
		var pos = [];
		var startPositive = new Point(startNormal.x*startNormal.x, startNormal.y*startNormal.y);
		var endPositive = new Point(endNormal.x*endNormal.x, endNormal.y*endNormal.y);
		var horizontal = startNormal.x != 0;
		pos[0] = horizontal ? start.y : start.x;

		horizontal = !horizontal;
		var i;
		if (startNormal.dotProduct(endNormal) == 0) {
			if ((startNormal.dotProduct(direction) >= 0)
				&& (endNormal.dotProduct(direction) <= 0)) {
				// 0
			} else {
				// 2
				if (startNormal.dotProduct(direction) < 0)
					i = startPositive.dotProduct(start.getTranslated(startNormal.getScaled(buffer)));
				else
					i = horizontal ? average.y : average.x;

				pos.push(i);
				horizontal = !horizontal;

				if (endNormal.dotProduct(direction) > 0)
					i = endPositive.dotProduct(end.getTranslated(endNormal.getScaled(buffer)));
				else
					i = horizontal ? average.y : average.x;

				pos.push(i);
				horizontal = !horizontal;
			}
		} else {
			if (startNormal.dotProduct(endNormal) > 0) {
				//1
				if (startNormal.dotProduct(direction) >= 0)
					i = startPositive.dotProduct(start.getTranslated(startNormal.getScaled(buffer)));
				else
					i = endPositive.dotProduct(end.getTranslated(endNormal.getScaled(buffer)));
				pos.push(i);
				horizontal = !horizontal;
			} else {
				//3 or 1
				if (startNormal.dotProduct(direction) < 0) {
					i = startPositive.dotProduct(start.getTranslated(startNormal.getScaled(buffer)));
					pos.push(i);
					horizontal = !horizontal;
				}

				i = horizontal ? average.y : average.x;
				pos.push(i);
				horizontal = !horizontal;

				if (startNormal.dotProduct(direction) < 0) {
					i = endPositive.dotProduct(end.getTranslated(endNormal.getScaled(buffer)));
					pos.push(i);
					horizontal = !horizontal;
				}
			}
		}
		pos.push(horizontal ? end.y : end.x);

		return pos;
	}

	// Process the positions.
	static processPositions(start, end, positions, horizontal) {
		var pos = [];
		pos[0] = horizontal ? start.x : start.y;
		var i;
		for (i = 0; i < positions.length; i++) {
			pos[i + 1] = positions[i];
		}
		pos.push((horizontal == (positions.length % 2 == 1)) ? end.x : end.y);

		var pts = [];
		pts[0] = start;
		var p;
		var current, prev;
		for (i = 2; i < pos.length - 1; i++) {
			horizontal = !horizontal;
			prev = pos[i - 1];
			current = pos[i];
			p = horizontal ? new Point(prev, current) : new Point(current, prev);
			pts.push(p);
		}
		pts.push(end);
		return pts;
	}

	/**
	 * Automatically route the connection to avoid intersections with other vertices.
	 */
	autoRoute(pts, container, boxes, startBox, endBox) {
		var side, side2, d, box, intersect, j;
		var channel, channel2, pt, dir;

		var startPadding = 0, endPadding;
		// first get the start and end channel
		box = boxes[endBox];
		pt = pts[pts.length - 2];
		if (pt.y < box.y)
			side = 1;
		else if (pt.y > box.y + box.height)
			side = 3;
		else if (pt.x < box.x)
			side = 0;
		else
			side = 2;
		channel = _getChannel(container, endBox, boxes, side);
		endPadding = channel.horizontal ? (channel.right - channel.left)/2 : (channel.bottom - channel.top)/2;

		for (var i = 0; i < pts.length - 1; i++) {
			if (pts[i+1].x == pts[i].x && pts[i+1].y == pts[i].y) continue;
			intersect = _getFirstIntersection(pts, i, boxes, startBox, endBox);
			if (!intersect) continue;
			j = intersect[0];
			side = intersect[1];
			box = boxes[j];
			channel = _getChannel(container, j, boxes, side);
			switch(side) {
				case 0:
				case 2:
					pt = new Point((channel.right + channel.left)/2, pts[i].y);
					dir = _getRouteTendency(pts, i, pt, box, side);
					side2 = dir < 0 ? 1 : 3;
					channel2 = _getChannel(container, j, boxes, side2);
					// if the previous point is in the channel2, use that point instead of center of the channel.
					if (i > 1 && (pts[i-2].y == pts[i-1].y) && (pts[i-1].y > channel2.top && pts[i-1].y < channel2.bottom))
						d = pts[i-1].y - pt.y;
					else if (i < pts.length - 3 && (pts[i+2].y == pts[i+3].y) && (pts[i+2].y > channel2.top && pts[i+2].y < channel2.bottom))
						d = pts[i+2].y - pt.y;
					else
						d = (channel2.bottom + channel2.top)/2 - pt.y;
					// check if we need this pt.
					if ((side == 0 && pt.x <= pts[i].x) || (side == 2 && pt.x >= pts[i].x))
						pt = null;
					else if (i > 0) {
						// see if we can push the line out to where we started.
						if (!_hasIntersection(
								[new Point(pts[i].x, pts[i].y), new Point(pts[i].x, pts[i].y + d), new Point(pt.x, pt.y + d)],
								boxes))
							pt = null;
					}
					break;
				case 1:
				case 3:
					pt = new Point(pts[i].x, (channel.bottom + channel.top)/2);
					dir = _getRouteTendency(pts, i, pt, box, side);
					side2 = dir < 0 ? 0 : 2;
					channel2 = _getChannel(container, j, boxes, side2);
					// if the previous point is in the channel2, use that point instead of center of the channel.
					if (i > 1 && (pts[i-2].x == pts[i-1].x) && (pts[i-1].x > channel2.left && pts[i-1].x < channel2.right))
						d = pts[i-1].x - pt.x;
					else if (i < pts.length - 3 && (pts[i+2].x == pts[i+3].x) && (pts[i+2].x > channel2.left && pts[i+2].x < channel2.right))
						d = pts[i+2].x - pt.x;
					else
						d = (channel2.right + channel2.left)/2 - pt.x;
					// check if we need this pt.
					if ((side == 1 && pt.y <= pts[i].y) || (side == 3 && pt.y >= pts[i].y))
						pt = null;
					else if (i > 0) {
						// see if we can push the line out to where we started.
						if (!_hasIntersection(
								[new Point(pts[i].x, pts[i].y), new Point(pts[i].x + d, pts[i].y), new Point(pt.x + d, pt.y)],
								boxes))
							pt = null;
					}
					break;
				case 4:
					continue;
			}
			// max points.
			if (i > 20) return;
			if (pt && (pt.x != pts[i].x || pt.y != pts[i].y)) {
				pts.splice(i+1, 0, pt);
				_moveSegment(pts, i+1, d, startPadding, endPadding);
				i++;
			} else
				_moveSegment(pts, i, d, startPadding, endPadding);
		}
	}

	_hasIntersection(pts, boxes) {
		for (var i = 0; i < pts.length - 1; i++) {
			for (var j = 0; j < boxes.length; j++) {
				if (boxes[j].detectIntersection(pts[i], pts[i+1]) >= 0)
					return true;
			}
		}
		return false;
	}

	_getFirstIntersection(pts, i, boxes, startBox, endBox) {
		var box, side, savedIndex = null, savedSide = null;
		for (var j = 0; j < boxes.length; j++) {
			if ((i == 0 && j == startBox) || (i == pts.length - 2 && j == endBox))
				continue;
			box = boxes[j];
			side = box.detectIntersection(pts[i], pts[i+1]);
			if (side >= 0) {
				if (savedIndex == null) {
					savedIndex = j;
					savedSide = side;
				} else {
					if (boxes[savedIndex].distance(pts[i]) > box.distance(pts[i])) {
						savedIndex = j;
						savedSide = side;
					}
				}
			}
		}
		if (savedIndex != null)
			return [savedIndex, savedSide];
		return null;
	}

	_getRouteTendency(pts, i, breakPt, box, side) {
		var dir;
		var p;
		switch (side) {
			case 0:
			case 2:
				p = "y";
				break;
			case 1:
			case 3:
				p = "x";
				break;
		}
		//first try the breakpt.
		dir = _getRouteDirection(breakPt, pts[pts.length - 1])[p];
		if (dir == 0) {
			dir = -_getRouteDirection(pts[0], pts[pts.length - 1])[p];
			if (dir == 0) {
				if (breakPt[p] < box.getCenter()[p])
					dir = -1;
				else
					dir = 1;
			}
		}
		return dir;
	}

	_getRouteDirection(pt1, pt2) {
		if (pt1.x == pt2.x) {
			if (pt1.y < pt2.y) return Point.S;
			return Point.N;
		} else if (pt1.y == pt2.y) {
			if (pt1.x < pt2.x) return Point.E;
			return Point.W;
		} else if (pt1.x < pt2.x) {
			if (pt1.y < pt2.y) return Point.SE;
			return Point.NE;
		} else {
			if (pt1.y < pt2.y) return Point.SW;
			return Point.NW;
		}
	}

	_getChannel(container, index, boxes, side) {
		var maxChannelWidth = this.maxChannelWidth;
		var box1 = boxes[index], box2;
		var pt, i;
		var channel = {}, l, t, b, r;
		switch (side) {
			case 0:
				pt = box1.getLeft();
				channel.right = pt.x;
				channel.horizontal = false;
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					r = boxes[i].getRight().x;
					if (r >= pt.x) continue;
					if (!channel.left || channel.left < r)
						channel.left = r;
				}
				if (!channel.left) {
					channel.left = container.getLeft().x;
					if (channel.right - channel.left > maxChannelWidth)
						channel.left = channel.right - maxChannelWidth;
				}
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					box2 = boxes[i];
					b = box2.getBottom().y;
					t = box2.getTop().y;
					if (b < pt.y && (box2.getRight() > channel.left && box2.getLeft() < channel.right)) {
						if (!channel.top || channel.top < b)
							channel.top = b;
					}
					if (t > pt.y && (box2.getRight() > channel.left && box2.getLeft() < channel.right)) {
						if (!channel.bottom || channel.bottom > t)
							channel.bottom = t;
					}
				}
				if (!channel.top) channel.top = container.getTop().y;
				if (!channel.bottom) channel.bottom = container.getBottom().y;
				break;
			case 1:
				pt = box1.getTop();
				channel.horizontal = true;
				channel.bottom = pt.y;
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					b = boxes[i].getBottom().y;
					if (b >= pt.y) continue;
					if (!channel.top || channel.top < b)
						channel.top = b;
				}
				if (!channel.top) {
					channel.top = container.getTop().y;
					if (channel.bottom - channel.top > maxChannelWidth)
						channel.top = channel.bottom - maxChannelWidth;
				}
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					box2 = boxes[i];
					l = box2.getLeft().x;
					r = box2.getRight().x;
					if (r < pt.x && (box2.getBottom() > channel.top && box2.getTop() < channel.bottom)) {
						if (!channel.left || channel.left < r)
							channel.left = r;
					}
					if (l > pt.x && (box2.getBottom() > channel.top && box2.getTop() < channel.bottom)) {
						if (!channel.right || channel.right > l)
							channel.right = l;
					}
				}
				if (!channel.left) channel.left = container.getLeft().x;
				if (!channel.right) channel.right = container.getRight().x;

				break;
			case 2:
				pt = box1.getRight();
				channel.horizontal = false;
				channel.left = pt.x;
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					l = boxes[i].getLeft().x;
					if (l <= pt.x) continue;
					if (!channel.right || channel.right > l)
						channel.right = l;
				}
				if (!channel.right) {
					channel.right = container.getRight().x;
					if (channel.right - channel.left > maxChannelWidth)
						channel.right = channel.left + maxChannelWidth;
				}
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					box2 = boxes[i];
					b = box2.getBottom().y;
					t = box2.getTop().y;
					if (b < pt.y && (box2.getRight() > channel.left && box2.getLeft() < channel.right)) {
						if (!channel.top || channel.top < b)
							channel.top = b;
					}
					if (t > pt.y && (box2.getRight() > channel.left && box2.getLeft() < channel.right)) {
						if (!channel.bottom || channel.bottom > t)
							channel.bottom = t;
					}
				}
				if (!channel.top) channel.top = container.getTop().y;
				if (!channel.bottom) channel.bottom = container.getBottom().y;
				break;
			case 3:
				pt = box1.getBottom();
				channel.horizontal = true;
				channel.top = pt.y;
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					box2 = boxes[i];
					if (box2.getTop().y <= pt.y) continue;
					if (!channel.bottom || channel.bottom > box2.getTop().y)
						channel.bottom = box2.getTop().y;
				}
				if (!channel.bottom) {
					channel.bottom = container.getBottom().y;
					if (channel.bottom - channel.top > maxChannelWidth)
						channel.bottom = channel.top + maxChannelWidth;
				}
				for (i = 0; i < boxes.length; i++) {
					if (i == index) continue;
					box2 = boxes[i];
					l = box2.getLeft().x;
					r = box2.getRight().x;
					if (r < pt.x && (box2.getBottom() > channel.top && box2.getTop() < channel.bottom)) {
						if (!channel.left || channel.left < r)
							channel.left = r;
					}
					if (l > pt.x && (box2.getBottom() > channel.top && box2.getTop() < channel.bottom)) {
						if (!channel.right || channel.right > l)
							channel.right = l;
					}
				}
				if (!channel.left) channel.left = container.getLeft().x;
				if (!channel.right) channel.right = container.getRight().x;
				break;
		}
		return channel;
	}

	/**
	 * Move a line segment by a specified distance.
	 *
	 * @param pts the list of points.
	 * @param i the index of the segment.
	 * @param d the distance to move.
	 * @param startPadding
	 * @param endPadding
	 */
	_moveSegment(pts, i, d, startPadding, endPadding) {
		// first check if we need to add new line segments.
		var dir, l, pt;
		if (i == 0) {
			// we need to break off the segment, since we can't change the starting point.
			dir = pts[0].getDirection(pts[1]);
			if (!startPadding)
				startPadding = this.MIN_BUFFER;
			l = Math.min(startPadding, pts[0].distance(pts[1])/2);
			pt = pts[0].getTranslated(dir.scale(l));
			pts.splice(1, 0, pt);
			_moveSegment(pts, i+1, d);
			return;
		}
		if (i == pts.length - 2) {
			// we need to break off the segment, since we can't change the end point.
			dir = pts[pts.length-1].getDirection(pts[pts.length-2]);
			if (!endPadding)
				endPadding = this.MIN_BUFFER;
			l = Math.min(endPadding, pts[pts.length-1].distance(pts[pts.length-2])/2);
			pt = pts[pts.length - 1].getTranslated(dir.scale(l));
			pts.splice(pts.length - 1, 0, pt);
			_moveSegment(pts, i, d);
			return;
		}

		if (pts[i].y == pts[i+1].y) {
			if (i > 0 && pts[i - 1].y == pts[i].y) {
				pts.splice(i + 1, 0, pts[i].clone());
				i++;
			}
			if (i < pts.length - 2 && pts[i+1].y == pts[i+2].y)
				pts.splice(i + 1, 0, pts[i+1].clone());
			pts[i].y += d;
			pts[i+1].y += d;
		} else {
			if (i > 0 && pts[i - 1].x == pts[i].x) {
				pts.splice(i + 1, 0, pts[i].clone());
				i++;
			}
			if (i < pts.length - 2 && pts[i+1].x == pts[i+2].x)
				pts.splice(i + 1, 0, pts[i+1].clone());
			pts[i].x += d;
			pts[i+1].x += d;
		}
	}

	/**
	 * This method will merge the redundant segments.
	 */
	_mergeSegments(pts) {
		var h1 = pts[pts.length-1].y == pts[pts.length-2].y;
		var h2;
		for (var i = pts.length - 2; i >= 1; i--) {
			h2 = pts[i].y == pts[i-1].y;
			if (h2 == h1 || (pts[i].equals(pts[i-1])))
				pts.splice(i, 1);
			else
				h1 = !h1;
		}
	}
}

linkTypes['direct'] = DirectLink;
linkTypes['bezier'] = BezierLink;
linkTypes['entityRelations'] = EntityRelations;
linkTypes['manhattan'] = Manhattan;

export default Link;
