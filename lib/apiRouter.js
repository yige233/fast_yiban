import express from 'express';
import {
    app_key,
    maxImgSize,
    allowedImage,
    allowedFile
} from "../config.js";


function getRouter(app) {
    const files = app.files;
    const router = express.Router();
    router.get('/AmapKey', (req, res) => {
        res.setHeader("Content-Type", "application/json");
        return res.send(JSON.stringify({
            key: app_key
        }));

    });
    router.post('/upload', (req, res) => {
        const token = req.headers['autoyiban-token'] || null;
        const chunks = [];
        let received = 0;

        if (!token) {
            return req.destroy();
        };
        if (!files.has(token)) {
            return req.destroy();
        };
        const {
            name,
            size,
            type,
            client,
            save,
        } = files.get(token);
        try {
            if (![...allowedFile, ...allowedImage].includes(type)) throw new Error("不允许的文件类型:", type);
            if (req.headers['content-type'] != type) throw new Error("文件类型与预检时提供的类型不符:", type);
            if (req.headers['content-length'] != size) throw new Error("文件大小与预检时提供的大小不符:", size);
            if (save) {
                if (req.headers['content-length'] && req.headers['content-length'] > maxImgSize) throw new Error(`文件太大。应小于 ${maxImgSize} B`);
            };
            req.on("data", chunk => {
                chunks.push(chunk);
                received += chunk.length;
                if (save && (received > maxImgSize)) throw new Error(`文件太大。应小于 ${maxImgSize} B`);
            });
            req.on('end', async () => {
                const receivedFile = Buffer.concat(chunks);
                res.statusCode = 204;
                files.delete(token);
                client.upload({
                    name: name,
                    type: type,
                    size: size,
                    data: receivedFile
                });
                return res.end();
            });
        } catch (err) {
            return req.destroy();
        };
    });
    return router;
};

export default getRouter;