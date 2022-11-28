import Client from "./core.js";
import components from "./components.js";
import {
    dom,
    Base64,
    createTab,
    Log
} from "./tool.js";

const logger = new Log(document.querySelector("#logs"));

class App extends Client {
    blacklists = [];
    isFromImport = false;
    constructor() {
        super();
        this.on("message", data => logger.log(data));
        this.on("newForm", data => this.formRender(data));
        this.on("shareLink", data => logger.log(`当次任务的分享链接：<a href="${data}" target="_blank">${data}</a>`));
        this.on("submitDone", result => {
            logger.log(result.message);
            if (this.isFromImport) return;
            history.pushState(200, "", window.location.origin + window.location.pathname + "?data=" + encodeURIComponent(Base64.encode(JSON.stringify(this.export))));
        });
        try {
            const existedDataRaw = new URL(window.location.href).searchParams.get("data");
            if (existedDataRaw) {
                document.querySelector("div.tabHeader>div:nth-child(4)").dispatchEvent(new Event("mouseover"));
                logger.log("开始导入数据，并尝试自动打卡……");
                this.isFromImport = true;
                const existedData = JSON.parse(Base64.decode(existedDataRaw));
                this.import(existedData).then(ok => {
                    ok && logger.log("成功完成自动打卡。");
                });
            };
        } catch (err) {
            logger.log("data的数据格式不正确。请检查数据是否是正确的base64字符串。");
            console.error(err);
        };
        document.querySelector("#login button").addEventListener("click", async e => {
            if (this.active) return;
            const inputs = document.querySelectorAll("#login input");
            document.querySelector("div.tabHeader>div:nth-child(4)").dispatchEvent(new Event("mouseover"));
            await this.login(inputs[0].value, inputs[1].value);
            this.submit();
        });
    };
    formRender(data) {
        const supportComs = new Map([
            ["AutoTakePosition", (item, desc) => {
                const elem = dom(`<yiban-TakePosition ${item.props.required?"required":""} desc=${desc} type=${item.component}></yiban-TakePosition>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail.main, e.detail.manual);
                    this.dataEx(item.id, "time");
                });
                return elem;
            }],
            ["GdMap", (item, desc) => {
                return supportComs.get("AutoTakePosition")(item, desc);
            }],
            ["AreaSelect", (item, desc) => {
                const elem = dom(`<yiban-AreaSelect ${item.props.required?"required":""} desc=${desc}></yiban-AreaSelect>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail.main, e.detail.manual);
                });
                return elem;
            }],
            ["Radio", (item, desc) => {
                const elem = dom(`<yiban-Selector ${item.props.required?"required":""} desc=${desc} name=${item.id} options='${item.props.options.join("|")}' type=${item.component}></yiban-Selector>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail.main, e.detail.manual);
                });
                return elem;
            }],
            ["Checkbox", (item, desc) => {
                return supportComs.get("Radio")(item, desc);
            }],
            ["Input", (item, desc) => {
                const elem = dom(`<yiban-Textarea ${item.props.required?"required":""} desc=${desc}></yiban-Textarea>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail.main, e.detail.manual);
                });
                return elem;
            }],
            ["Textarea", (item, desc) => {
                return supportComs.get("Input")(item, desc);
            }],
            ["InputNumber", (item, desc) => {
                return supportComs.get("Input")(item, desc);
            }],
            ["Attachment", (item, desc) => {
                const elem = dom(`<yiban-File ${item.props.required?"required":""} desc=${desc} type="${item.component}"></yiban-File>`);
                elem.addEventListener("yiban-formdata", async e => {
                    this.data(item.id, []);
                    if (item.component == "Signature") {
                        this.data(item.id, "");
                    };
                    this.addFile(item.id, {
                        type: item.component,
                        data: e.detail.main
                    });
                });
                return elem;
            }],
            ["Signature", (item, desc) => {
                return supportComs.get("Attachment")(item, desc);
            }],
            ["Image", (item, desc) => {
                return supportComs.get("Attachment")(item, desc);
            }],
            ["Date", (item, desc) => {
                const elem = dom(`<yiban-Date ${item.props.required?"required":""} desc=${desc} ></yiban-Date>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail.main, e.detail.manual);
                });
                return elem;
            }],
            ["Text", (item, desc) => {
                return dom(`<yiban-Text ${item.props.required?"required":""} desc=${desc}></yiban-Text>`);
            }],
            ["default", (item, desc) => {
                logger.log("未知或不支持的表单组件:", item.component, "属于项目:", item.props.label || "");
                return document.createComment(desc);
            }]
        ]);
        document.querySelector("#form > div:nth-child(1)").innerHTML = "打卡表单：" + data.WFName;
        const container = document.querySelector("#form > div:nth-child(2)");
        const form = data.Form;
        container.innerHTML = "";
        if (this.blacklists.includes(data.Id)) return logger.log("该表单", data.Id, "存在于程序的黑名单之中，故不显示其内容。");
        this.wfid = data.Id;
        for (const item of form) {
            const {
                props,
                component
            } = item;
            if (!this.rawData[item.id] || this.rawData[item.id].manual == true) { //如果该项目不存在数据，或者数据被设为手动，就加载该项目
                const desc = `${props.extra ?props.extra+"，":""}${props.label||""}`;
                const itemElem = (supportComs.get(component) || supportComs.get("default"))(item, desc);
                container.append(itemElem);
            };
        };
        const submitBtn = dom(`<button>提交表单</button>`);
        submitBtn.addEventListener("click", async e => {
            if (!this.active) return;
            document.querySelector("div.tabHeader>div:nth-child(4)").dispatchEvent(new Event("mouseover"));
            if (await this.fileHandler()) this.submit().then(res => {
                if (this.isFromImport) return;
                res.ok && logger.log("打卡流程结束！请收藏当前的网址(Ctrl+D)，下次打开收藏的网址时，就可以自动或快速打卡了");
            });
        });
        container.append(submitBtn);
    };
};

createTab(document.querySelector(".tabContainer"));
fetch("./res/announcement.json").then(res => res.json()).then(json => {
    for (let i of json) {
        var div = document.createElement("div");
        div.innerHTML = i;
        document.querySelector("#info").append(div);
    };
});
window.app = new App();

components.AreaSelect.defineSelf("yiban-AreaSelect");
components.TakePosition.defineSelf("yiban-TakePosition");
components.Selector.defineSelf("yiban-Selector");
components.Textarea.defineSelf("yiban-Textarea");
components.File.defineSelf("yiban-File");
components.Date.defineSelf("yiban-Date");
components.Text.defineSelf("yiban-Text");