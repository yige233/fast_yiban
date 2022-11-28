import fetch from "node-fetch";
import Tool from "./tool.js";
import {
    maxImgSize,
    allowedImage,
    allowedFile
} from "../config.js";


const symbol_id = Symbol("id");

class Submission {
    events = new Map([
        ["checkUpload", []]
    ]);
    csrf = Tool.uuid(); //可以是固定的uuid
    fetchHeader = {
        "Origin": "https://c.uyiban.com",
        "User-Agent": "yiban_android",
        "AppVersion": "5.0.3",
        "Content-Type": "application/x-www-form-urlencoded"
    };
    ws = null;
    user = null;
    lastActive = Math.floor(new Date() / 1e3);
    createdAt = Math.floor(new Date() / 1e3);
    //传入ws连接和配置
    constructor(id, ws) {
        this[symbol_id] = id;
        this.ws = ws;
        ws.on("message", (data, isBinary) => this.handleMessage(data, isBinary));
        ws.on("close", () => {
            this.lastActive = -1; //连接关闭时将最后连接时间设为-1，便于快速清理掉这个Submission对象
        });
    };
    get id() {
        return this[symbol_id];
    };
    //发送客户端显示的消息，代码为0
    message(...messages) {
        this.data("message", messages.join(" "));
    };
    //发送需要客户和程序处理的数据，
    data(event, data = {}) {
        const events = new Map([
            ["message", 1],
            ["auth", 2],
            ["shareLink", 3],
            ["submitDone", 4],
            ["checkFile", 5],
            ["uploadFile", 6],
            ["newForm", 7],
            ["lastSubmit", 8]
        ]);
        if (!this.ws) return;
        this.ws.send(`${events.get(event)||1}${JSON.stringify({data})}`);
    };
    //关闭ws连接
    close(reason) {
        this.message(reason);
        this.ws.close();
    };
    on(event, callback) {
        if (!this.events.has(event)) throw new Error("不存在的事件:", event);
        this.events.get(event).push(callback);
    };
    remove(event, callback) {
        if (!this.events.has(event)) throw new Error("不存在的事件:", event);
        const callbacks = this.events.get(event);
        callbacks.splice(callbacks.findIndex(i => i == callback), 1);
    };
    //处理ws信息
    async handleMessage(data, isBinary) {
        if (isBinary) return;
        this.lastActive = Math.floor(new Date() / 1e3); //有新信息时，更新最后活动时间
        const dataStr = data.toString();
        try {
            const [code, dataRaw] = [dataStr.slice(0, 1), dataStr.slice(1)];
            const dataObj = dataRaw ? JSON.parse(dataRaw) : "{}";
            switch (code) {
                case "0": //ws连接保活，代码为0
                    this.ws.send("0");
                    break;
                case "1": //执行登录
                    this.auth(dataObj);
                    break;
                case "2": //执行任务提交流程
                    if (!this.user) this.close("未登录易班");
                    this.execute(dataObj);
                    break;
                case "3": //执行图片上传前的检查
                    if (!this.user) this.close("未登录易班");
                    this.checkUpload(dataObj);
                    break;
                case "4":
                    if (!this.user) this.close("未登录易班");
                    const fullForm = await this.getFullForm(dataObj.wfid);
                    this.message(fullForm.message);
                    if (!fullForm.ok) break;
                    this.data("newForm", fullForm.data.data);
                    break;
                case "9":
                    break;
                default:
                    break;
            };
        } catch (err) {
            console.log(err);
        };
    };
    //上传文件前的预检
    async checkUpload(data) {
        this.message("开始预检将要上传的文件……");
        const result = {
            ok: false
        };
        const {
            uploadType = "direct", name = null, size = 0, type = "", component = "Attachment"
        } = data;
        try {
            if (!name) throw new Error("需要提供一个文件名");
            if (!["direct", "url"].includes(uploadType)) throw new Error("不允许的上传类型:" + uploadType);
            if (uploadType == "url") {
                this.message("上传类型为url，将通过服务器直接上传");
                const getFile = await fetch(data.url);
                if (!getFile.ok) {
                    throw new Error(`从url获取文件失败: ${getFile.status} ${getFile.statusText}`);
                };
                result.message = "上传预检完成。稍后将返回上传结果。";
                result.ok = true;
                this.upload({
                    name: name,
                    type: getFile.headers.get("content-type"),
                    size: getFile.headers.get("content-length"),
                    component: component,
                    data: await getFile.blob(),
                });
            };
            if (uploadType == "direct") {
                const token = Tool.uuid();
                for (let eventListener of this.events.get("checkUpload")) eventListener({
                    token: token,
                    data: {
                        name: name,
                        type: type,
                        size: size,
                        component: component,
                        client: this
                    }
                });
                result.message = "上传预检完成。";
                result.token = token;
                result.ok = true;
            };
        } catch (err) {
            result.message = err.message || null;
        };
        this.data("checkFile", result);
    };
    //登录易班
    async auth(data) {
        const {
            account = 0, passwd = null
        } = data;
        try {
            if (!account || !passwd) throw new Error("请提供账号和密码！");
            this.message("登录易班进度:0/3");

            //获取yiban_user_token
            const doLogin = await fetch("https://www.yiban.cn/login/doLoginAjax", {
                method: "POST",
                headers: this.fetchHeader,
                body: `account=${account}&password=${passwd}`
            });
            const loginResult = await doLogin.json();
            const userToken = Tool.getcookie(doLogin.headers.get('set-cookie'), "yiban_user_token");
            if (loginResult.code != 200) throw new Error(loginResult.message);
            this.message("登录易班进度:1/3");

            //获取verify_request
            const verifyRequest = await fetch("https://f.yiban.cn/iframe/index?act=iapp7463", {
                redirect: "manual",
                headers: Object.assign({
                    cookie: `yiban_user_token=${userToken}`
                }, this.fetchHeader)
            }).then(res => res.headers.get("location"));
            const verifyRequestUrl = new URL(verifyRequest.replace("#", "_")).searchParams.get("verify_request");
            if (!verifyRequestUrl) throw new Error("获取verifyRequest失败。请重试，或联系程序作者寻求支持。");
            this.message("登录易班进度:2/3");

            //获取最终需要的cpi、PHPSESSID
            const authCookie = await fetch(`https://api.uyiban.com/base/c/auth/yiban?verifyRequest=${verifyRequestUrl}&CSRF=${this.csrf}`, {
                headers: Object.assign({
                    cookie: `csrf_token=${this.csrf}`
                }, this.fetchHeader)
            }).then(res => res.headers.get('set-cookie'));
            if (!Tool.getcookie(authCookie, "cpi")) throw new Error("请打开以下链接，并授权“易班校本化”后重试:https://oauth.yiban.cn/code/html?client_id=95626fa3080300ea&redirect_uri=https://f.yiban.cn/iapp7463");
            Object.assign(this.fetchHeader, {
                cookie: `csrf_token=${this.csrf}; PHPSESSID=${Tool.getcookie(authCookie, "PHPSESSID")}; cpi=${Tool.getcookie(authCookie, "cpi")}`
            });
            this.user = account;
            this.data("auth", {
                ok: true,
                message: "登录易班进度:3/3 登录成功！"
            });
        } catch (err) {
            this.data("auth", {
                ok: false,
                message: "登录易班失败:" + err.message
            });
        };
    };
    //获取未完成任务列表，忽略未到开始时间的任务
    async getAllTasks() {
        this.message("开始获取所有未完成的任务……");
        const result = {
            ok: false,
            data: []
        };
        try {
            const json = await fetch(`https://api.uyiban.com/officeTask/client/index/uncompletedList?CSRF=${this.csrf}`, {
                headers: this.fetchHeader
            }).then(res => res.json());
            if (json.code != 0) throw new Error(json.msg);
            if (json.data.length == 0) throw new Error("没有检测到任务！");
            for (let task of json.data) {
                if (task.TimeoutState != 1) continue;
                if (![0, 4].includes(task.State)) continue; //0为未完成，1为待审核，2为已完成，4为已撤销
                if (task.StartTime <= (new Date() / 1e3)) result.data.push({
                    taskId: task.TaskId,
                    title: task.Title
                });
            };
            if (!result.data.length) throw new Error("没有可以立即提交的任务！");

            result.message = "成功获取任务列表";
            result.ok = true;
        } catch (err) {
            result.message = "获取任务列表出错:" + err.message;
        };
        return result;
    };
    //获取任务详细信息
    async getTaskDetail(data) {
        const {
            taskId = 0, title = "未知"
        } = data;
        const result = {
            ok: false,
        };
        this.message(`开始获取任务: ${title} 的具体内容`);
        try {
            if (taskId == 0) throw new Error("未提供任务ID");
            const res = await fetch(`https://api.uyiban.com/officeTask/client/index/detail?TaskId=${taskId}&CSRF=${this.csrf}`, {
                headers: this.fetchHeader
            }).then(res => res.json());
            if (res.code != 0) throw new Error(json.msg);
            if (res.data.IsLost) throw new Error("表单数据丢失");

            result.data = res.data;
            result.message = `成功获取任务: ${title} 的详细信息`;
            result.ok = true;
        } catch (err) {
            result.message = `获取任务: ${title} 的详细信息出错: ${err.messag}`;
        };
        return result;
    };
    //获取任务具体表单
    async getFullForm(wfid = 0) {
        this.message(`开始获取工作流 ${wfid} 的具体表单项目`);
        const result = {
            ok: false,
        };
        try {
            if (wfid == 0) throw new Error("错误的wfid: 0");
            const res = await fetch(`https://api.uyiban.com/workFlow/c/my/form/${wfid}?CSRF=${this.csrf}`, {
                headers: this.fetchHeader
            });

            result.data = await res.json();
            result.message = `成功获取工作流 ${wfid} 的具体表单项目`;
            result.ok = true;
        } catch (err) {
            result.message = `获取工作流 ${wfid} 的具体表单项目出错: ${err.message}`;
        };
        return result;
    };
    //获取分享链接
    async share(shareId) {
        return await fetch(`https://api.uyiban.com/workFlow/c/work/share?InitiateId=${shareId}&Action=view&Key=&CSRF=${this.csrf}`, {
            headers: this.fetchHeader
        }).then(res => res.json()).then(json => `https://app.uyiban.com/workflow/client/#/share?Key=${json.data.key}`);
    };
    //获取2周内，某表单的上一次成功提交的数据。传入想要获取的表单的id
    async getCompleteTask(wfid = 0) {
        function format(date) {
            date = new Date(date);
            return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
        };
        const endtTime = Date.now();
        const startTime = endtTime - (60 * 60 * 24 * 14 * 1e3);
        const completedList = await fetch(`https://api.uyiban.com/officeTask/client/index/completedList?StartTime=${format(startTime)}&EndTime=${format(endtTime)}&CSRF=${this.csrf}`, {
            headers: this.fetchHeader
        }).then(res => res.json());
        const normalTasks = [];
        if (completedList.code != 0) {
            this.data("lastSubmit", {
                ok: false,
                message: completedList.msg || completedList.message
            });
            return false;
        };
        if (completedList.data.length == 0) {
            this.data("lastSubmit", {
                ok: false,
                message: "两周内没有已完成的打卡任务"
            });
            return false;
        };
        for (let i of completedList.data) {
            if (i.State != 2) continue;
            normalTasks.push(i);
        };
        if (normalTasks.length == 0) {
            this.data("lastSubmit", {
                ok: false,
                message: "两周内没有正常完成的打卡任务"
            });
            return false;
        };
        normalTasks.sort((a, b) => {
            return b.StartTime - a.StartTime;
        });
        for (let task of normalTasks) {
            const taskDetial = await fetch(`https://api.uyiban.com/officeTask/client/index/detail?TaskId=${task.TaskId}&CSRF=${this.csrf}`, {
                headers: this.fetchHeader
            }).then(res => res.json());
            if (wfid != taskDetial.data.WFId) continue;
            const fullForm = await fetch(`https://api.uyiban.com/workFlow/c/work/show/view/${taskDetial.data.InitiateId}?CSRF=${this.csrf}`, {
                headers: this.fetchHeader
            }).then(res => res.json());
            this.data("lastSubmit", {
                ok: true,
                data: fullForm.data.Initiate.FormDataJson,
                message: "成功获取到上一次打卡提交的数据"
            });
            return true;
        };
        this.data("lastSubmit", {
            ok: false,
            message: "没有获取到上一次打卡提交的数据。可能是提供了错误的wfid"
        });
    };
    //提交任务
    async doSubmit(taskDetail, submitData) {
        this.message("开始提交任务:", taskDetail.Title);
        const result = {
            ok: false,
        };
        const extend = {
                TaskId: taskDetail.Id,
                title: "任务信息",
                content: [{
                    label: "任务名称",
                    value: taskDetail.Title
                }, {
                    label: "发布机构",
                    value: taskDetail.PubOrgName
                }]
            },
            params = {
                WFId: taskDetail.WFId,
                Data: JSON.stringify(submitData),
                Extend: JSON.stringify(extend)
            };
        try {
            const body = Tool.encrypt(JSON.stringify(params), "2knV5VGRTScU7pOq", "UmNWaNtM0PUdtFCs"),
                bodyb64 = Buffer.from(body, 'utf-8').toString('base64'),
                bodyEncodeuri = encodeURIComponent(bodyb64);
            const res = await fetch(`https://api.uyiban.com/workFlow/c/my/apply/?CSRF=${this.csrf}`, {
                method: "POST",
                headers: this.fetchHeader,
                body: `Str=${bodyEncodeuri}`
            });
            const json = await res.json();
            if (json.code != 0) throw new Error(json.msg);

            result.data = json;
            result.message = ("提交任务成功");
            result.ok = true;
        } catch (err) {
            result.message = "提交任务失败:" + err.message;
        };
        return result;
    };
    //上传文件
    async upload(file) {
        const {
            component = "attachment", name = "", type = "", size = 0, data = new Blob()
        } = file;
        this.message("开始向易班上传:", name);
        const result = {
            ok: false,
        };
        try {
            if (![...allowedFile, ...allowedImage].includes(type)) throw new Error("不允许上传的文件类型: " + type);
            if (size >= maxImgSize) throw new Error(`文件大小不合规: 应大于0B，小于 ${maxImgSize} B`);
            let uploadBaseUrl = "https://api.uyiban.com/workFlow/c/my/getUploadUriForAttachment";
            if (component == "signature") {
                uploadBaseUrl == "https://api.uyiban.com/workFlow/c/my/getUploadUrl/png";
            };
            if (component == "image") {
                uploadBaseUrl == "https://api.uyiban.com/workFlow/c/my/getUploadUrl";
            };
            const queryStr = `name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}&size=${size}&CSRF=${this.csrf}`;
            const checkUpload = await fetch([uploadBaseUrl, queryStr].join("?"), {
                headers: this.fetchHeader
            }).then(res => res.json());
            if (checkUpload.code != 0) throw new Error("没能获取上传链接:", checkUpload.message || checkUpload.msg)
            const uploadOk = await fetch(checkUpload.data.signedUrl, {
                headers: {
                    "content-type": type,
                    "content-length": size
                },
                method: "put",
                body: data
            }).then(res => res.ok);
            if (!uploadOk) throw new Error("没能将文件上传至易班服务器:", uploadOk.message || uploadOk.msg);
            if (component == "attachment") {
                await fetch(`https://api.uyiban.com/system/common/upload/getFileUrl?FilePath=${encodeURIComponent(checkUpload.data.fileName)}&CSRF=${this.csrf}`, {
                    headers: this.fetchHeader
                }).then(res => res.json());
                result.data = {
                    id: checkUpload.data.attachmentId,
                    name: name,
                    size: size,
                    type: type
                };
            };
            if (component == "image") {
                result.data = {
                    fileName: checkUpload.data.fileName,
                    name: file.name,
                    path: checkUpload.data.fileName,
                    percent: 100,
                    status: "done",
                    size: file.size,
                    uid: undefined
                };
            };
            if (component == "signature") {
                result.data = checkUpload.data.fileName;
            };
            result.message = "成功上传文件至易班: " + name;
            result.ok = true;
        } catch (err) {
            result.message = "上传失败: " + err.message;
        };
        this.data("uploadFile", result);
    };
    //执行完整流程
    async execute(data) {
        const {
            submitData = {}, wfid = 0,
        } = data;
        this.message("开始打卡流程");
        try {
            const currentTasks = await this.getAllTasks();
            this.message(currentTasks.message);
            if (!currentTasks.ok) throw false;

            if (wfid == 0) {
                const task = currentTasks.data[0];
                this.message(`没有提供有效的wfid。流程目标变更为获取最新的任务表单。将返回任务: ${task.title} 的表单项目`);

                const taskDetail = await this.getTaskDetail(task);
                this.message(taskDetail.message);
                if (!taskDetail.ok) throw false;

                const fullForm = await this.getFullForm(taskDetail.data.WFId);
                this.message(fullForm.message);
                if (!fullForm.ok) throw false;

                this.data("newForm", fullForm.data.data);
                return this.data("submitDone", {
                    ok: false,
                    message: "流程结束。"
                });
            };
            for (let task of currentTasks.data) {
                const taskDetail = await this.getTaskDetail(task);
                this.message(taskDetail.message);
                if (!taskDetail.ok) throw false;

                if (wfid == taskDetail.data.WFId) {
                    const result = await this.doSubmit(taskDetail.data, submitData);
                    this.message(result.message);
                    if (!result.ok) throw false;

                    const shareLink = await this.share(result.data.data);
                    if (!shareLink) this.message("获取分享链接失败:", task.title);
                    this.data("shareLink", shareLink);
                };
            };
            this.data("submitDone", {
                ok: true,
                message: "流程结束。"
            });
        } catch (err) {
            const tail = (err && err.message) ? ": " + err.message : "。"
            this.data("submitDone", {
                ok: false,
                message: "流程异常终止" + tail
            });
        };
    };
};

export default Submission;