import { Vector3 } from 'three';
import Extent from '../../Geographic/Extent';
import OGCWebServiceHelper from './OGCWebServiceHelper';

export default {
    preprocessDataLayer(layer) {
        if (!layer.extent) {
            throw new Error('layer.extent is required');
        }

        if (!(layer.extent instanceof Extent)) {
            layer.extent = new Extent(layer.projection, layer.extent);
        }

        layer.options = {};
    },

    tileInsideLimit(tile, layer) {
        // Only fetch level 0 (full res texture): node with level > 0 will inherit the
        // texture from their parent
        return tile.level === 0 && layer.extent.intersect(tile.extent);
    },

    getColorTexture(tile, layer) {
        if (!this.tileInsideLimit(tile, layer)) {
            return Promise.reject(`Tile '${tile}' is outside layer bbox ${layer.extent}`);
        }
        if (tile.material === null) {
            return Promise.resolve();
        }

        return OGCWebServiceHelper.getColorTextureByUrl(layer.url, layer.networkOptions).then((texture) => {
            const result = {
                texture,
                pitch: new Vector3(0, 0, 1),
            };

            result.texture.extent = tile.extent;
            result.texture.coords = layer.extent;
            // LayeredMaterial expects coords.zoom to exist, and describe the
            // precision of the texture (a la WMTS).
            result.texture.coords.zoom = 0;
            return result;
        });
    },

    executeCommand(command) {
        const tile = command.requester;
        const layer = command.layer;
        return this.getColorTexture(tile, layer);
    },
};
