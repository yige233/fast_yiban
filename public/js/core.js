import {
    Base64
} from "./tool.js";

const active = Symbol("avtive");
const auto = Symbol("auto");

class Client {
    events = new Map([
        ["message", []], //普通消息
        ["auth", []], //登录认证
        ["shareLink", []], //分享链接
        ["submitDone", []], //提交完成
        ["checkFile", []], //预检文件
        ["uploadFile", []], //上传文件
        ["newForm", []], //新表单
        ["lastSubmit", []], //上一次打卡的结果（未使用
        ["heartbeat", []] //心跳（未使用，没啥用
    ]);
    user = []; //0为用户名，1为密码。姑且用Base64编码，避免一眼就被看光。
    constructor() {
        this[active] = false;
        this.clean();
    };
    on(event, callback) { //添加事件
        if (!this.events.has(event)) throw new Error("不存在的事件:", event);
        this.events.get(event).push(callback);
    };
    remove(event, callback) { //移除事件
        if (!this.events.has(event)) throw new Error("不存在的事件:", event);
        const callbacks = this.events.get(event);
        callbacks.splice(callbacks.findIndex(i => i == callback), 1);
    };
    emit(event, data) { //触发事件
        const callbacks = this.events.get(event) || [];
        for (let i of callbacks) i(data);
    };
    clean() { //清理数据。不会影响登录状态
        this.wfid = 0;
        this.submitData = {};
        this.files = {};
        this.extra = {};
        this[auto] = true;
    };
    async login(account, passwd) { //登录
        if (!account || !passwd) {
            this.emit("message", "无法登录易班: 请提供账号和密码");
            return false;
        };
        this.user = [account, Base64.encode(passwd)];
        const ws = new WebSocket(((location.protocol == "https:") ? "wss:" : "ws:") + "//" + location.hostname);
        this.ws = ws;
        ws.addEventListener("message", e => {
            const events = new Map([
                ["0", "heartbeat"],
                ["1", "message"],
                ["2", "auth"],
                ["3", "shareLink"],
                ["4", "submitDone"],
                ["5", "checkFile"],
                ["6", "uploadFile"],
                ["7", "newForm"],
                ["8", "lastSubmit"]
            ]);
            const [event, dataRaw] = [events.get(e.data.slice(0, 1)), e.data.slice(1)];
            const data = (event == "heartbeat") ? null : JSON.parse(dataRaw || "{}");
            this.emit(event, data.data);
        });
        ws.addEventListener("open", e => {
            this.send("login", {
                account,
                passwd
            });
        });
        ws.addEventListener("close", e => {
            this.emit("message", "已断开Websocket连接。");
            this[active] = false;
        });
        ws.addEventListener("error", e => {
            this.emit("message", "连接服务器时发生错误。");
            this[active] = false;
        });
        return await new Promise((resolve) => {
            this.on("auth", res => {
                this.emit("message", res.message);
                this[active] = res.ok;
                resolve(res.ok);
            });
        });
    };
    send(type, data) { //发送数据。
        const types = new Map([
            ["keepAlive", 0], //保活
            ["login", 1], //登录
            ["submit", 2], //提交表单
            ["checkFile", 3], //检查文件
            ["test", 4]
        ]);
        const typeCode = types.get(type) || "0";
        this.ws.send(`${typeCode}${data ? JSON.stringify(data) : ""}`);
    };
    //处理文件上传。将addFile方法维护的文件列表转换为用于打卡的数据。之所以不采用实时上传，是为了尽量节约服务器资源。
    async fileHandler() {
        for (let id in this.files) {
            const result = [];
            const files = this.files[id] || new Map();
            for (const file of files.data.values()) {
                const check = {
                    name: file.data.name,
                    size: 0,
                    type: null,
                    data: null
                };
                if (file.upload == "url") {
                    if (!file.data.url) continue;
                    check.url = file.data.url;
                };
                if (file.upload == "direct") {
                    if (!file.data) continue;
                    check.size = file.data.size;
                    check.type = file.data.type;
                    check.data = file.data
                };
                const uploadRes = await this.upload(check, file.upload);
                if (!uploadRes) return false; //直接返回false，阻止提交
                if (file.allowAuto == false) this[auto] = false;
                if (file.type == "Signature") {
                    this.data(id, uploadRes.path);
                    break;
                };
                result.push(uploadRes);
            };
            this.data(id, result);
        };
        return true;
    };
    submit() { //提交表单
        if (!this.active) return false;
        for (let id in this.extra) {
            const data = this.extra[id];
            switch (data.type) {
                case "time":
                    this.submitData[id].time = new Date().toLocaleString("chinese", {
                        hour12: false
                    });
                    break;
                default:
                    break;
            };
        };
        return new Promise((resolve) => {
            if (!this.active) return resolve(false);
            this.send("submit", {
                wfid: this.wfid || 0,
                submitData: this.submitData || {}
            });
            this.on("submitDone", res => resolve(res));
        });
    };
    async upload(file, type = "direct") { //上传文件
        if (!this.active) return false;
        const checkFile = {
            uploadType: type,
            name: file.name || null,
        };
        if (type == "url") {
            checkFile.url = file.url;
        };
        if (type == "direct") {
            checkFile.size = file.size;
            checkFile.type = file.type;
        };
        this.send("checkFile", checkFile);
        const checkRes = await new Promise((resolve) => {
            this.on("checkFile", res => resolve(res));
        });
        this.emit("message", checkRes.message);
        if (!checkRes.ok) return false;
        if (type == "direct") {
            fetch("./api/upload", {
                headers: {
                    "autoyiban-token": checkRes.token
                },
                method: "post",
                body: file.data
            }).catch(() => false);
        };
        const uploadRes = await new Promise(resolve => {
            this.on("uploadFile", res => resolve(res));
        });
        this.emit("message", uploadRes.message);
        if (!uploadRes.ok) return false;
        return uploadRes.data;
    };
    data(id, data) { //添加表单数据
        this.submitData[id] = data;
    };
    dataEx(id, type, data = "") { //添加额外的表单数据。打卡表单的内容可能不会每次都相同，有变化的部分可以通过额外数据记录，自动打卡时，根据该记录实时生成打卡内容。
        switch (type) {
            case "time": //目前只有定位用到时间
                this.extra[id] = {
                    type: "time"
                };
                break;
            default:
                break;
        };
    };
    addFile(id, file) { //添加文件。此时并未真正添加文件，而是维护一个文件Map
        this.files[id] = file;
    };
    async import(data) { //导入数据，并自动执行打卡
        const {
            user,
            wfid,
            submitData,
            extra,
            auto
        } = data;
        if (!auto) { //想象这样的情况：打卡表单需要提供当天的健康码。将该项设置为仅当次打卡生效，就能避免不小心上传到过期的健康码的问题。
            this.emit("message", "导入的数据不允许自动执行打卡任务。");
            return;
        };
        await this.login(user[0], Base64.decode(user[1]));
        this.wfid = wfid;
        this.submitData = submitData;
        this.extra = extra;
        if (this.active) this.submit();
    };
    get export() { //导出数据
        return {
            auto: this[auto],
            user: [this.user[0] || 0, this.user[1] || 0],
            wfid: this.wfid,
            submitData: this.submitData,
            extra: this.extra
        };
    };
    get active() { //用户活动状态
        return this[active];
    };
};

export default Client;
