import express from 'express';
import fetch from "node-fetch";
import bodyParser from 'body-parser';
import CryptoJS from "crypto-js";
import proxy from "http-proxy-middleware";
import fs from "fs";

class tool {
    static getcookie(cookie, name) {
        let value = "";
        let c = cookie.split(/;|\s/);
        for (let i in c) {
            if (c[i].split("=")[0] == name) {
                value = c[i].split("=")[1]
            };
        };
        return value;
    };
    static time() {
        return new Date().toLocaleString("chinese", {
            hour12: false
        });
    };
    static getQueryVariable(url, variable) {
        var query = url.split(/&|\?/),
            value = "";
        for (let i in query) {
            if (query[i].split("=")[0] == variable) {
                value = query[i].split("=")[1]
            };
        };
        return value;
    };
    static encrypt(word, keyStr, ivStr) {
        keyStr = keyStr ? keyStr : "123456789";
        ivStr = ivStr ? ivStr : "123456789";
        let key = CryptoJS.enc.Utf8.parse(keyStr);
        let iv = CryptoJS.enc.Utf8.parse(ivStr);
        let src = CryptoJS.enc.Utf8.parse(word);
        let encrypted = CryptoJS.AES.encrypt(src, key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return encrypted.toString();
    };
};
class Main {
    csrf = "365a9bc7c77897e40b0c7ecdb87806d9";
    header = {
        "Origin": "https://c.uyiban.com",
        "User-Agent": "yiban_android",
        "AppVersion": "5.0.3",
        "Content-Type": "application/x-www-form-urlencoded"
    };
    info = {};
    constructor(data) {
        this.account = data.account;
        this.passwd = data.passwd;
        this.submit_data = JSON.parse(data.submit.replace("{{time}}", tool.time()));
        this.current_wfid = data.wfid;
    };
    extend(task_id, task_detail) {
        return {
            TaskId: task_id,
            title: "任务信息",
            content: [{
                label: "任务名称",
                value: task_detail.Title
            }, {
                label: "发布机构",
                value: task_detail.PubOrgName
            }]
        }
    };
    async auth() {
        let [res1, cookie1] = await fetch("https://www.yiban.cn/login/doLoginAjax", {
            method: "POST",
            headers: this.header,
            body: `account=${this.account}&password=${this.passwd}`
        }).then(async res => [await res.json(), res.headers.get('set-cookie')]).catch(err => {
            throw err;
        });
        if (res1.code != 200) return [false, res1.message];
        let verify_request = await fetch("https://f.yiban.cn/iframe/index?act=iapp7463", {
            redirect: "manual",
            headers: Object.assign({
                cookie: `yiban_user_token=${tool.getcookie(cookie1, "yiban_user_token")}`
            }, this.header),
        }).then(res => {
            return tool.getQueryVariable(res.headers.get("location"), "verify_request");
        }).catch(err => {
            throw err;
        });
        if (!verify_request) return [false, "登录步骤2失败"];
        let cookie2 = await fetch(`https://api.uyiban.com/base/c/auth/yiban?verifyRequest=${verify_request}&CSRF=${this.csrf}`, {
            headers: Object.assign({
                cookie: `csrf_token=${this.csrf}`
            }, this.header)
        }).then(res => res.headers.get('set-cookie')).catch(err => {
            throw err;
        });
        if (tool.getcookie(cookie2, "cpi")) return [true, cookie2];
        return [false, "请打开以下链接，并授权“易班校本化”后重试：https://oauth.yiban.cn/code/html?client_id=95626fa3080300ea&redirect_uri=https://f.yiban.cn/iapp7463"];
    };
    async get_task_id() {
        return await fetch(`https://api.uyiban.com/officeTask/client/index/uncompletedList?CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json()).then(json => {
            if (json.code != 0) return [false, json.msg];
            if (json.data.length == 0)[false, "没有检测到任务！"];
            return [true, json.data[0].TaskId];
        });
    };
    async check_task(task_id) {
        let res = await fetch(`https://api.uyiban.com/officeTask/client/index/detail?TaskId=${task_id}&CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json());
        if (res.code != 0) return [false, res.msg];
        if (res.data.IsLost) return [false, "表单数据丢失"];
        return [true, res.data];
    };
    async getformcontext(wfid) {
        return await fetch(`https://api.uyiban.com/workFlow/c/my/form/${wfid}?CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json());
    };
    async share(share_id) {
        return await fetch(`https://api.uyiban.com/workFlow/c/work/share?InitiateId=${share_id}&Action=view&Key=&CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json()).then(json => `https://app.uyiban.com/workflow/client/#/share?Key=${json.data.key}`);
    };
    async submit(task_id, submit_data, task_detail) {
        let extend = this.extend(task_id, task_detail),
            params = {
                WFId: this.current_wfid,
                Data: JSON.stringify(submit_data),
                Extend: JSON.stringify(extend)
            },
            body = tool.encrypt(JSON.stringify(params), "2knV5VGRTScU7pOq", "UmNWaNtM0PUdtFCs"),
            bodyb64 = Buffer.from(body, 'utf-8').toString('base64'),
            body_encodeuri = encodeURIComponent(bodyb64);
        return await fetch(`https://api.uyiban.com/workFlow/c/my/apply/?CSRF=${this.csrf}`, {
            method: "POST",
            headers: this.header,
            body: `Str=${body_encodeuri}`
        }).then(res => res.json());
    };
    async run() {
        let [login_ok, login] = await this.auth();
        if (!login_ok) return {
            ts: tool.time(),
            code: 1,
            msg: "登录时遇到错误：" + login
        };
        let result_cookie = `csrf_token=${this.csrf}; PHPSESSID=${tool.getcookie(login, "PHPSESSID")}; cpi=${tool.getcookie(login, "cpi")}`;
        this.header = Object.assign({
            cookie: result_cookie
        }, this.header);
        let [task_id_ok, task_id] = await this.get_task_id();
        if (!task_id_ok) return {
            ts: tool.time(),
            code: 1,
            msg: "获取任务id时遇到错误：" + task_id
        };
        let [task_check_wfid_ok, task_detail] = await this.check_task(task_id);
        if (!task_check_wfid_ok) return {
            ts: tool.time(),
            code: 1,
            msg: "检查任务时遇到错误：" + task_detail
        };
        if (task_detail.WFId != this.current_wfid) return {
            ts: tool.time(),
            code: 2,
            msg: task_detail.WFId,
            fullmsg: await this.getformcontext(task_detail.WFId)
        };
        let result = await this.submit(task_id, this.submit_data, task_detail);
        if (result.code != 0) return {
            ts: tool.time(),
            code: 0,
            msg: "提交表单时出现错误：" + result.msg,
            fullmsg: result
        };
        return {
            ts: tool.time(),
            code: 3,
            msg: await this.share(result.data),
            fullmsg: result
        };
    };
};

(async () => {
    let config = await new Promise(async (resolve) => {
        let fsp = fs.promises;
        let f = await fsp.open("config.json", "r"),
            data = await f.readFile();
        f.close();
        resolve(JSON.parse(data.toString()));
    });
    config.port = config.port || 4500;
    if (!config.app_key || !config.app_secret_code) return console.log("需要提供app_key以及app_secret_code，以正常使用地图组件！");
    let app = express();
    let errors = [];
    app.use(express.static('public'));
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(bodyParser.json());
    app.use(proxy.createProxyMiddleware('/_AMapService', {
        target: "https://restapi.amap.com/",
        changeOrigin: true,
        pathRewrite: (path) => {
            return path.slice(13) + "&jscode=" + config.app_secret_code;
        }
    }));
    app.get('/yiban', function (req, res) {
        let file = "",
            text = "";
        switch (req.query.r) {
            case "b":
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                file = "b.html";
                break;
            case "b-mobile":
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                file = "b-mobile.html";
                break;
            case "b-format":
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                file = "b-format.html";
                break;
            case "Amap":
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                text = config.app_key;
                break;
            case "a":
                res.setHeader("Content-Type", "application/json");
                file = "announcement.json";
                break;
            case "errors":
                res.setHeader("Content-Type", "application/json");
                text = JSON.stringify(errors);
                break;
            case "bl":
                res.setHeader("Content-Type", "application/json");
                file = "blacklist.json";
                break;
            default:
                break;
        };
        if (file) return res.sendFile(file, {
            root: "./data/"
        });
        if (text) return res.send(text);
        res.status(404).end();
    });
    app.post("/yiban", async function (req, res) {
        let body = "";
        switch (req.query.r) {
            case "e":
                res.setHeader("Content-Type", "application/json");
                let main = new Main(req.body);
                body = await main.run().catch(err => {
                    errors.push(err.toString());
                    return {
                        ts: tool.time(),
                        code: 0,
                        msg: `错误：${err}`,
                        fullmsg: req.body
                    };
                });
                break;
            default:
                break;
        };
        if (body) {
            res.send(body);
            return;
        };
        res.status(404).end();
    });
    app.listen(config.port);
    console.log(`易班自动打卡已运行于 ${config.port} 端口...`);
})();