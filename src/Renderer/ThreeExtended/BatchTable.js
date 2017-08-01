const textDecoder = new TextDecoder('utf-8');

export default {
    parseBatchTableJSON(buffer) {
        const content = textDecoder.decode(new Uint8Array(buffer));
        const json = JSON.parse(content);
        return json;
    },
};
