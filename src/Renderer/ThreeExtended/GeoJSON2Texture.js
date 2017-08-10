import * as THREE from 'three';
import { UNIT } from '../../Core/Geographic/Coordinates';

const sizeTexture = 256;
const a = new THREE.Vector3();
const b = new THREE.Vector3();

function drawLine(coordOrigin, tileWH, p1, p2, thickness, ctx) {
    var tilePx = sizeTexture;
    ctx.beginPath();
    a.subVectors(p1, coordOrigin).multiplyScalar(tilePx / tileWH.x);
    b.subVectors(p2, coordOrigin).multiplyScalar(tilePx / tileWH.x);
    ctx.moveTo(a.x, tilePx - a.y);
    ctx.lineTo(b.x, tilePx - b.y);
    ctx.stroke();
}
function drawPolygon(polygon, vertices, coordOrigin, tileWH, ctx, prop) {
    var tilePx = sizeTexture;
    ctx.strokeStyle = prop.stroke;
    ctx.lineWidth = prop['stroke-width'];
    ctx.fillStyle = prop.fill;
    ctx.globalAlpha = prop['fill-opacity'];
    ctx.beginPath();

    for (var i = polygon.offset; i < polygon.offset + polygon.count - 1; ++i) {
        var p1 = vertices[i];
        var p2 = vertices[i + 1];
        a.subVectors(p1, coordOrigin).multiplyScalar(tilePx / tileWH.x);
        b.subVectors(p2, coordOrigin).multiplyScalar(tilePx / tileWH.x);

        if (i === 0) {
            ctx.moveTo(a.x, tilePx - a.y);
            ctx.lineTo(b.x, tilePx - b.y);
        } else {
            ctx.lineTo(b.x, tilePx - b.y);
        }
    }
    ctx.closePath();
    ctx.globalAlpha = prop['fill-opacity'];
    ctx.fill();
    ctx.globalAlpha = prop['stroke-opacity'];
    ctx.stroke();
}
function createRasterImage(extent, features, sizeTexture) {
    const origin = new THREE.Vector2(extent.west(UNIT.DEGREE), extent.south(UNIT.DEGREE));
    const dimension = extent.dimensions(UNIT.DEGREE);
    const size = new THREE.Vector2(dimension.x, dimension.y);

    var c = document.createElement('canvas');
    c.width = sizeTexture;
    c.height = sizeTexture;
    var ctx = c.getContext('2d');
    // Lines
    const lines = features.children[1];
    /* eslint-disable guard-for-in */
    for (const id in lines.featureVertices) {
        const line = lines.featureVertices[id];
        const properties = features.features[id].properties.properties;
        ctx.strokeStyle = properties.stroke;
        ctx.lineWidth = properties['stroke-width'];
        ctx.globalAlpha = properties['stroke-opacity'];
        for (let i = line.offset; i < line.offset + line.count - 1; ++i) {
            drawLine(origin, size, lines.vertices[i], lines.vertices[i + 1], 4, ctx, properties);
        }
    }
    // polygons
    const polygons = features.children[2];
    for (const id in polygons.featureVertices) {
        const polygon = polygons.featureVertices[id];
        const properties = features.features[id].properties.properties;
        drawPolygon(polygon, polygons.vertices, origin, size, ctx, properties);
    }
    /* eslint-enable guard-for-in */
    var texture = new THREE.Texture(c);
    texture.flipY = true;  // FALSE by default on THREE.DataTexture but True by default for THREE.Texture!
    texture.needsUpdate = true;
    texture.name = 'featureRaster';
    return texture;
}
export default {
    createServiseWMS(features) {
        return {
            features,
            getTexture: function getTexture(extent, sizeTexture) { return createRasterImage(extent, this.features, sizeTexture); },
        };
    },
};
