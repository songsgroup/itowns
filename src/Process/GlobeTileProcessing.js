import * as THREE from 'three';
import SchemeTile from '../Scene/SchemeTile';
import MathExt from '../Core/Math/MathExtended';
import { UNIT, ellipsoidSizes } from '../Core/Geographic/Coordinates';
import BoundingBox from '../Scene/BoundingBox';
import { SIZE_TEXTURE_TILE } from '../Core/Commander/Providers/OGCWebServiceHelper';

const cV = new THREE.Vector3();
let vhMagnitudeSquared;
let radius;

let preSSE;
let SSE_SUBDIVISION_THRESHOLD;

export function preGlobeUpdate(context) {
    radius = ellipsoidSizes();
    // pre-horizon culling
    cV.copy(context.camera.position()).divide(radius);
    vhMagnitudeSquared = cV.lengthSq() - 1.0;

    // pre-sse
    const hypotenuse = Math.sqrt(context.camera.width * context.camera.width + context.camera.height * context.camera.height);
    const radAngle = context.camera.FOV * Math.PI / 180;

     // TODO: not correct -> see new preSSE
    // const HFOV = 2.0 * Math.atan(Math.tan(radAngle * 0.5) / context.camera.ratio);
    const HYFOV = 2.0 * Math.atan(Math.tan(radAngle * 0.5) * hypotenuse / context.camera.width);

    preSSE = hypotenuse * (2.0 * Math.tan(HYFOV * 0.5));
}

function pointHorizonCulling(pt) {
    var vT = pt.divide(radius).sub(cV);

    var vtMagnitudeSquared = vT.lengthSq();

    var dot = -vT.dot(cV);

    var isOccluded =
        vhMagnitudeSquared < dot &&
        vhMagnitudeSquared < dot * dot / vtMagnitudeSquared;

    return isOccluded;
}

function horizonCulling(node) {
    // horizonCulling Oriented bounding box
    var points = node.OBB().pointsWorld;
    var isVisible = false;

    for (const point of points) {
        if (!pointHorizonCulling(point.clone())) {
            isVisible = true;
            break;
        }
    }

    return isVisible;
}

const frustum = new THREE.Frustum();
const obbViewMatrix = new THREE.Matrix4();

function frustumCullingOBB(node, camera) {
    // Move camera in OBB local space
    obbViewMatrix.multiplyMatrices(camera.viewMatrix, node.OBB().matrixWorld);

    frustum.setFromMatrix(obbViewMatrix);

    return frustum.intersectsBox(node.OBB().box3D);
}

export function globeCulling(node, camera) {
    return !(frustumCullingOBB(node, camera) && horizonCulling(node));
}

function computeNodeSSE(camera, node) {
    const boundingSphere = node.geometry.boundingSphere;
    const distance = Math.max(
        0.0,
        camera.camera3D.position.distanceTo(node.centerSphere) - boundingSphere.radius);

    // Removed because is false computation, it doesn't consider the altitude of node
    // Added small oblique weight (distance is not enough, tile orientation is needed)
    /*
    var altiW = node.bbox.top() === 10000 ? 0. : node.bbox.bottom() / 10000.;
    var dotProductW = Math.min(altiW + Math.abs(this.camera3D.getWorldDirection().dot(node.centerSphere.clone().normalize())), 1.);
    if (this.camera3D.position.length() > 6463300) dotProductW = 1;
    var SSE = Math.sqrt(dotProductW) * this.preSSE * (node.geometricError / distance);
    */

    // TODO: node.geometricError is computed using a hardcoded 18 level
    // The computation of node.geometricError is surely false
    return preSSE * (node.geometricError / distance);
}

export function globeSubdivisionControl(minLevel, maxLevel, sseThreshold) {
    SSE_SUBDIVISION_THRESHOLD = sseThreshold;
    return function _globeSubdivisionControl(context, layer, node) {
        if (node.level < minLevel) {
            return true;
        }
        if (maxLevel <= node.level) {
            return false;
        }

        const sse = computeNodeSSE(context.camera, node);

        return SSE_SUBDIVISION_THRESHOLD < sse;
    };
}

// bbox longitude(0,360),latitude(-90,90)
export const globeSchemeTile0 = 0;
// bbox longitude(-180,180),latitude(-90,90)
export const globeSchemeTile1 = 1;

export function globeSchemeTileWMTS(type) {
    const schemeT = new SchemeTile();

    if (type === 0) {
        // bbox longitude(0,360),latitude(-90,90)
        schemeT.add(new BoundingBox('EPSG:4326', 0, MathExt.PI, -MathExt.PI_OV_TWO, MathExt.PI_OV_TWO));
        schemeT.add(new BoundingBox('EPSG:4326', MathExt.PI, MathExt.TWO_PI, -MathExt.PI_OV_TWO, MathExt.PI_OV_TWO));
    } else if (type == 1) {
        // bbox longitude(-180,180),latitude(-90,90)
        schemeT.add(new BoundingBox('EPSG:4326', -MathExt.PI, 0, -MathExt.PI_OV_TWO, MathExt.PI_OV_TWO));
        schemeT.add(new BoundingBox('EPSG:4326', 0, MathExt.PI, -MathExt.PI_OV_TWO, MathExt.PI_OV_TWO));
    }
    // store internally as Radians to avoid doing too much deg->rad conversions
    for (const bbox of schemeT.schemeBB) {
        bbox.minCoordinate._internalStorageUnit = UNIT.RADIAN;
        bbox.maxCoordinate._internalStorageUnit = UNIT.RADIAN;
    }
    return schemeT;
}

export function computeTileZoomFromDistanceCamera(distance) {
    const sizeEllipsoid = ellipsoidSizes().x;
    const preSinus = SIZE_TEXTURE_TILE * (SSE_SUBDIVISION_THRESHOLD * 0.5) / preSSE / sizeEllipsoid;

    let sinus = distance * preSinus;
    let zoom = Math.log(Math.PI / (2.0 * Math.asin(sinus))) / Math.log(2);

    const delta = Math.PI / Math.pow(2, zoom);
    const circleChord = 2.0 * sizeEllipsoid * Math.sin(delta * 0.5);
    const radius = circleChord * 0.5;

    // adjust with bounding sphere rayon
    sinus = (distance - radius) * preSinus;
    zoom = Math.log(Math.PI / (2.0 * Math.asin(sinus))) / Math.log(2);

    return isNaN(zoom) ? 0 : Math.round(zoom);
}

export function computeDistanceCameraFromTileZoom(zoom) {
    const delta = Math.PI / Math.pow(2, zoom);
    const circleChord = 2.0 * ellipsoidSizes().x * Math.sin(delta * 0.5);
    const radius = circleChord * 0.5;
    const error = radius / SIZE_TEXTURE_TILE;

    return preSSE * error / (SSE_SUBDIVISION_THRESHOLD * 0.5) + radius;
}