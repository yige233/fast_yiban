import {
    Base64
} from "./tool.js";

const active = Symbol("avtive");

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
        this.wfid = 0; //工作流id
        this.rawData = {}; //用于提交的数据
        this.files = {}; //将要上传到易班的文件列表
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
    waitEvent(event) { //等待事件触发
        return new Promise((resolve) => {
            let callback = (res) => {
                this.remove(event, callback);
                resolve(res);
            };
            this.on(event, callback);
        });
    };
    async login(account, passwd) { //登录
        if (!account || !passwd) {
            this.emit("message", "无法登录易班: 请提供账号和密码");
            return false;
        };
        this.user = [account, Base64.encode(passwd)];
        const ws = new WebSocket(((location.protocol == "https:") ? "wss:" : "ws:") + "//" + location.host);
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
            this.emit(event, data.data || null);
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
        const {
            ok,
            message
        } = await this.waitEvent("auth");
        this.emit("message", message);
        this[active] = ok;
        return ok;
    };
    send(type, data) { //发送数据。
        const types = new Map([
            ["keepAlive", 0], //保活
            ["login", 1], //登录
            ["submit", 2], //提交表单
            ["checkFile", 3], //检查文件
            ["getForm", 4], //获取表单内容
            ["test", 9]
        ]);
        const typeCode = types.get(type) || "0";
        this.ws.send(`${typeCode}${data ? JSON.stringify(data) : ""}`);
    };
    //处理文件上传。将addFile方法维护的文件列表转换为用于打卡的数据。之所以不采用实时上传，是为了尽量节约服务器资源。
    async fileHandler() {
        for (let id in this.files) {
            const result = [];
            let manual = false;
            const files = this.files[id] || new Map();
            const filesArr = Array.from(files.data.values()).sort((a, b) => (b.type == "signature") ? 1 : -1); //把signature类型排到最前面，优先处理
            for (const file of filesArr) {
                const check = {
                    component: file.type,
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
                file.manual && (manual = file.manual); //如果有一个文件是手动上传，那么整个项目就被判定为需要手动上传
                if (file.type == "signature") {
                    this.data(id, uploadRes, file.manual);
                    break;
                };
                result.push(uploadRes);
            };
            this.data(id, result, manual);
        };
        return true;
    };
    submit(wfid = this.wfid, rawData = this.rawData) { //提交表单
        if (!this.active) return false;
        const submitData = {};
        for (let id in rawData) {
            const extra = rawData[id].extra || {};
            switch (extra.type) {
                case "time": //目前只有定位用到时间
                    rawData[id].main.time = new Date().toLocaleString("chinese", {
                        hour12: false
                    });
                    break;
                default:
                    break;
            };
            submitData[id] = rawData[id].main;
        };
        this.send("submit", {
            wfid: wfid || 0,
            submitData: submitData || {}
        });
        return this.waitEvent("submitDone");
    };
    async upload(file, type = "direct") { //上传文件
        if (!this.active) return false;
        const checkFile = {
            uploadType: type,
            name: file.name || null,
            component: file.component
        };
        if (type == "url") {
            checkFile.url = file.url;
        };
        if (type == "direct") {
            checkFile.size = file.size;
            checkFile.type = file.type;
        };
        this.send("checkFile", checkFile);
        const checkRes = await this.waitEvent("checkFile");
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
        const uploadRes = await this.waitEvent("uploadFile");
        this.emit("message", uploadRes.message);
        if (!uploadRes.ok) return false;
        return uploadRes.data;
    };
    data(id, data, manual = false) { //添加表单数据
        if (!this.rawData[id]) this.rawData[id] = {};
        this.rawData[id].main = data;
        this.rawData[id].manual = manual;
    };
    dataEx(id, type, data = "") { //添加额外的表单数据。打卡表单的内容可能不会每次都相同，有变化的部分可以通过额外数据记录，自动打卡时，根据该记录实时生成打卡内容。
        switch (type) {
            case "time": //目前只有定位用到时间
                this.rawData[id].extra = {
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
            rawData
        } = data;
        await this.login(user[0], Base64.decode(user[1])); //先自动登录
        if (!this.active) return false;
        this.wfid = wfid;
        this.rawData = rawData; //导入rawData
        for (let id in rawData) { //检查是否有需要手动填写的项目
            if (rawData[id].manual) {
                this.emit("message", "导入的数据中存在需要手动填写的项目，请等待程序加载该项目，填写完成后点击“提交表单”");
                this.send("getForm", {
                    wfid
                }) //此时使用导入的wfid获取该工作流的表单
                return false;
            };
        };
        return await this.submit().then(res => res.ok);
    };
    get export() { //导出数据
        const rawData = {};
        for (let id in this.rawData) { //manual为false，就删除manual属性，减小数据大小
            rawData[id] = this.rawData[id];
            if (this.rawData[id].manual) rawData[id].main = "";
            else delete rawData[id].manual;
        };
        return {
            user: [this.user[0] || 0, this.user[1] || 0],
            wfid: this.wfid,
            rawData: rawData,
        };
    };
    get active() { //用户活动状态
        return this[active];
    };
};

export default Client;