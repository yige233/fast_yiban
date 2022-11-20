import express from 'express';
import http from 'http';
import proxy from "http-proxy-middleware";
import {
    WebSocketServer
} from "ws";
import {
    port,
    app_key,
    app_secret_code
} from "./config.js";
import Tool from "./lib/tool.js";
import Submission from "./lib/submission.js";
import getRouter from "./lib/apiRouter.js";

class App {
    clients = new Map(); //连接到服务器的ws客户端
    files = new Map(); //记录客户端发送的文件上传预检数据
    constructor() {
        const webs = express();
        webs.use(express.static('public')); //静态目录
        if (!app_secret_code || !app_key) {
            console.log("\x1B[33m缺少加载地图组件所需要的app_key和(或)app_secret_code，这会导致前端的地图组件无法正常加载！\x1B[0m");
        } else {
            webs.use(proxy.createProxyMiddleware("/_AMapService", { //创建代理服务器转发高德地图相关api
                target: "https://restapi.amap.com/",
                changeOrigin: true,
                pathRewrite: (path) => path.slice(13) + "&jscode=" + app_secret_code
            }));
        };
        webs.use("/api", getRouter(this)); //路由相关api
        const server = http.createServer(webs);
        const wss = new WebSocketServer({
            server
        });
        wss.on("connection", ws => this.onWsConnect(ws));
        setInterval(() => this.checkClients(), 10 * 1000); //每10秒清理客户端
        server.listen(port, () => console.log(`易班自动打卡服务器已运行于 ${port} 端口...`));
    };
    killCilent(clientId, reason = "无") {
        console.log("结束了一个客户端连接，原因:", reason);
        this.clients.get(clientId).close(reason);
        this.clients.delete(clientId)
    };
    checkClients() {
        this.clients.forEach((client, id) => {
            const now = Math.floor(new Date() / 1e3);
            if (client.lastActive < (now - 600)) this.killCilent(id, "长时间无消息传递，被服务器断开连接"); //清理10分钟无消息的客户端
            if (!client.user && client.createdAt < (now - 60)) this.killCilent(id, "长时间未登录，被服务器断开连接"); //清理1分钟未登录的客户端
        });
    };
    onWsConnect(ws) {
        const id = Tool.uuid();
        const client = new Submission(id, ws);
        this.clients.set(id, client);
        console.log("有新客户端连接到服务器，当前客户端数量:", this.clients.size);
        client.on("checkUpload", data => { //当同一个客户端提交了多个上传请求时，将删除尚未完成的上传请求
            this.files.forEach((value, key) => {
                if (value.client.id == data.data.client.id) files.delete(key);
            });
            this.files.set(data.token, data.data);
        });
    };
};
new App();