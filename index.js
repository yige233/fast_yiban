import express from 'express';
import fetch from "node-fetch";
import bodyParser from 'body-parser';
import CryptoJS from "crypto-js";
import proxy from "http-proxy-middleware";
import fs from "fs";
import nedb from "nedb";

const db = new nedb({
    filename: './data/errors.db',
    autoload: true
});

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
    static error(account, err, desc) {
        account = account.toString().substr(0, 3) + "****" + account.toString().substr(7);
        db.insert({
            ts: tool.time(),
            account: account,
            desc: desc || "",
            err: err
        });
        return err
    };
    static template(str, data) {
        if (!str) return false;
        for (let i in data) {
            if (typeof (data[i]) == "function") continue;
            let reg = new RegExp(`{{\\s*\\$${i}\\s*}}`, "g");
            str = str.replace(reg, data[i]);
        };
        return str;
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
    constructor(data) {
        this.account = data.account;
        this.passwd = data.passwd;
        this.submit_data = JSON.parse(data.submit);
        this.current_wfid = data.wfid;
        this.extra = data.extra;
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
    async auth() { //登录
        let [res1, cookie1] = await fetch("https://www.yiban.cn/login/doLoginAjax", {
            method: "POST",
            headers: this.header,
            body: `account=${this.account}&password=${this.passwd}`
        }).then(async res => [await res.json(), res.headers.get('set-cookie')]).catch(err => {
            throw tool.error(this.account, err);
        });
        if (res1.code != 200) {
            tool.error(this.account, res1.message, "login");
            return [false, res1.message];
        };

        let verify_request_header = await fetch("https://f.yiban.cn/iframe/index?act=iapp7463", {
            redirect: "manual",
            headers: Object.assign({
                cookie: `yiban_user_token=${tool.getcookie(cookie1, "yiban_user_token")}`
            }, this.header),
        }).then(res => res.headers).catch(err => {
            throw tool.error(this.account, err);
        });
        let verify_request = tool.getQueryVariable(verify_request_header.get("location"), "verify_request");
        if (!verify_request) {
            tool.error(this.account, verify_request_header, "login");
            return [false, "登录步骤2失败"];
        };

        let cookie2 = await fetch(`https://api.uyiban.com/base/c/auth/yiban?verifyRequest=${verify_request}&CSRF=${this.csrf}`, {
            headers: Object.assign({
                cookie: `csrf_token=${this.csrf}`
            }, this.header)
        }).then(res => res.headers.get('set-cookie')).catch(err => {
            throw tool.error(this.account, err);
        });
        if (tool.getcookie(cookie2, "cpi")) return [true, cookie2];
        tool.error(this.account, "未授权‘易班校本化’", "login");
        return [false, "请打开以下链接，并授权“易班校本化”后重试：https://oauth.yiban.cn/code/html?client_id=95626fa3080300ea&redirect_uri=https://f.yiban.cn/iapp7463"];
    };
    async get_task_id() { //获取未完成任务中的第一个任务，忽略未到开始时间的任务
        return await fetch(`https://api.uyiban.com/officeTask/client/index/uncompletedList?CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json()).then(json => {
            if (json.code != 0) return [false, json.msg];
            if (json.data.length == 0) return [false, "没有检测到任务！"];
            for (let task of json.data) {
                if (task.StartTime <= (new Date() / 1e3)) return [true, task.TaskId]
            };
            return [false, "没有可以立即提交的任务！"];
        });
    };
    async check_task(task_id) { //获取任务具体内容
        let res = await fetch(`https://api.uyiban.com/officeTask/client/index/detail?TaskId=${task_id}&CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json());
        if (res.code != 0) return [false, res.msg];
        if (res.data.IsLost) return [false, "表单数据丢失"];
        return [true, res.data];
    };
    async getformcontext(wfid) { //从id获取具体表单
        return await fetch(`https://api.uyiban.com/workFlow/c/my/form/${wfid}?CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json());
    };
    async share(share_id) { //获取分享链接
        return await fetch(`https://api.uyiban.com/workFlow/c/work/share?InitiateId=${share_id}&Action=view&Key=&CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json()).then(json => `https://app.uyiban.com/workflow/client/#/share?Key=${json.data.key}`);
    };
    async submit(task_id, submit_data, task_detail) { //提交任务
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
    async uploadimg(url, name) { //上传图片
        let imgtoupload = await fetch(url).then(res => res.blob());
        let uploadurl = await fetch(`https://api.uyiban.com/workFlow/c/my/getUploadUrl?name=${name}&type=${encodeURIComponent(imgtoupload.type)}&size=${imgtoupload.size}&CSRF=${this.csrf}`, {
            headers: this.header
        }).then(res => res.json());
        if (uploadurl.code != 0) return [false, uploadurl.message];
        let uploadres = await fetch(uploadurl.data.signedUrl, {
            headers: {
                "content-type": imgtoupload.type,
                "content-length": imgtoupload.size
            },
            method: "put",
            body: imgtoupload
        }).then(res => res.ok);
        if (!uploadres) return [false, "上传图片失败"];
        return [true, {
            name: name,
            size: imgtoupload.size,
            status: "done",
            percent: 100,
            fileName: uploadurl.data.fileName,
            path: uploadurl.data.fileName
        }];
    };
    async run() { //完整运行
        let [login_ok, login] = await this.auth(); //登录账号
        if (!login_ok) return {
            ts: tool.time(),
            code: 1,
            msg: "登录时遇到错误：" + login
        };
        let result_cookie = `csrf_token=${this.csrf}; PHPSESSID=${tool.getcookie(login, "PHPSESSID")}; cpi=${tool.getcookie(login, "cpi")}`;
        Object.assign(this.header, {
            cookie: result_cookie
        });
        let [task_id_ok, task_id] = await this.get_task_id(); //获取任务id
        if (!task_id_ok) return {
            ts: tool.time(),
            code: 1,
            msg: "获取任务id时遇到错误：" + tool.error(this.account, task_id, "get_task_id")
        };
        let [task_check_wfid_ok, task_detail] = await this.check_task(task_id); //获取任务具体内容
        if (!task_check_wfid_ok) return {
            ts: tool.time(),
            code: 1,
            msg: "检查任务时遇到错误：" + tool.error(this.account, task_detail, "check_task")
        };
        if (task_detail.WFId != this.current_wfid) return {
            ts: tool.time(),
            code: 2,
            msg: task_detail.WFId,
            fullmsg: await this.getformcontext(task_detail.WFId)
        };
        for (let key in this.extra) {
            switch (this.extra[key]) {
                case "TimeStamp":
                    this.submit_data[key].time = tool.time();
                    break;
                case "ImageUpload":
                    let data = [...this.submit_data[key]];
                    this.submit_data[key] = [];
                    for (let i of data) {
                        let [upload_ok, upload_data] = await this.uploadimg(i.url, i.name);
                        if (!upload_ok) return {
                            ts: tool.time(),
                            code: 1,
                            msg: "上传图片时出现错误：" + tool.error(this.account, upload_data, "uploadimg")
                        };
                        this.submit_data[key].push(upload_data);
                    };
                    break;
                default:
                    break;
            };
        };
        let result = await this.submit(task_id, this.submit_data, task_detail); //提交任务
        if (result.code != 0) return {
            ts: tool.time(),
            code: 0,
            msg: "提交表单时出现错误：" + tool.error(this.account, result.msg, "submit"),
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
    const config = await new Promise(async (resolve) => {
        let fsp = fs.promises;
        let f = await fsp.open("config.json", "r"),
            data = await f.readFile();
        f.close();
        resolve(JSON.parse(data.toString()));
    });
    const app = express();
    config.port = config.port || 4500;

    if (!config.app_key || !config.app_secret_code) return console.log("需要提供app_key以及app_secret_code，以正常使用地图组件！");
    app.use(express.static('public'));
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(bodyParser.json());
    app.use(proxy.createProxyMiddleware('/_AMapService', {
        target: "https://restapi.amap.com/",
        changeOrigin: true,
        pathRewrite: (path) => path.slice(13) + "&jscode=" + config.app_secret_code
    }));
    app.get('/yiban', async function (req, res) {
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
                text = await new Promise((resolve) => {
                    db.find({}, {
                        _id: 0
                    }, (err, res) => {
                        resolve(JSON.stringify(res));
                    });
                });
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
                const main = new Main(req.body);
                body = await main.run().catch(err => {
                    tool.error(main.account, err, "responding")
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
    app.listen(config.port, () => console.log(`易班自动打卡已运行于 ${config.port} 端口...`));
})();