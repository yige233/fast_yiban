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
    constructor() {
        super();
        this.on("message", data => logger.log(data));
        this.on("newForm", data => this.formRender(data));
        this.on("shareLink", data => logger.log(`当次任务的分享链接：<a href="${data}" target="_blank">${data}</a>`));
        this.on("submitDone", result => {
            logger.log(result.message);
            if (!result.ok || !this.export.auto) return;
            history.pushState(200, "", window.location.origin + window.location.pathname + "?data=" + encodeURIComponent(Base64.encode(JSON.stringify(this.export))));
        });
        try {
            const existedDataRaw = new URL(window.location.href).searchParams.get("data");
            if (existedDataRaw) {
                logger.log("开始导入数据，并尝试自动打卡……");
                const existedData = JSON.parse(Base64.decode(existedDataRaw));
                this.import(existedData);
            };
        } catch (err) {
            logger.log("data的数据格式不正确。请检查数据是否是正确的base64字符串。");
            console.error(err);
        };
        document.querySelector("#login button").addEventListener("click", async e => {
            if (this.active) return;
            const inputs = document.querySelectorAll("#login input");
            await this.login(inputs[0].value, inputs[1].value);
            if (this.active && await this.fileHandler()) this.submit();
        });
    };
    formRender(data) {
        const supportComs = new Map([
            ["AutoTakePosition", (item, required, desc) => {
                const elem = dom(`<yiban-TakePosition ${required?"required":""} desc=${desc} type=${item.component}></yiban-TakePosition>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail);
                    this.dataEx(item.id, "time");
                });
                return elem;
            }],
            ["GdMap", (item, required, desc) => {
                return supportComs.get("AutoTakePosition")(item, required, desc);
            }],
            ["AreaSelect", (item, required, desc) => {
                const elem = dom(`<yiban-AreaSelect ${required?"required":""} desc=${desc}></yiban-AreaSelect>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail);
                });
                return elem;
            }],
            ["Radio", (item, required, desc) => {
                const elem = dom(`<yiban-Selector ${required?"required":""} desc=${desc} name=${item.id} options='${item.props.options.join("|")}' type=${item.component}></yiban-Selector>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail);
                });
                return elem;
            }],
            ["Checkbox", (item, required, desc) => {
                return supportComs.get("Radio")(item, required, desc);
            }],
            ["Input", (item, required, desc) => {
                const elem = dom(`<yiban-Textarea ${required?"required":""} desc=${desc}></yiban-Textarea>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail);
                });
                return elem;
            }],
            ["Textarea", (item, required, desc) => {
                return supportComs.get("Input")(item, required, desc);
            }],
            ["InputNumber", (item, required, desc) => {
                return supportComs.get("Input")(item, required, desc);
            }],
            ["Attachment", (item, required, desc) => {
                const elem = dom(`<yiban-File ${required?"required":""} desc=${desc} type="${item.component}"></yiban-File>`);
                elem.addEventListener("yiban-formdata", async e => {
                    this.data(item.id, []);
                    if (item.component == "Signature") {
                        this.data(item.id, "");
                    }
                    this.addFile(item.id, {
                        type: item.component,
                        data: e.detail
                    });
                });
                return elem;
            }],
            ["Signature", (item, required, desc) => {
                return supportComs.get("Attachment")(item, required, desc);
            }],
            ["Image", (item, required, desc) => {
                return supportComs.get("Attachment")(item, required, desc);
            }],
            ["Date", (item, required, desc) => {
                const elem = dom(`<yiban-Date ${required?"required":""} desc=${desc} ></yiban-Date>`);
                elem.addEventListener("yiban-formdata", e => {
                    this.data(item.id, e.detail);
                });
                return elem;
            }],
            ["Text", (item, required, desc) => {
                return dom(`<yiban-Text ${required?"required":""} desc=${desc}></yiban-Text>`);
            }],
            ["default", (item, required, desc) => {
                logger.log("未知或不支持的表单组件:", item.component, "属于项目:", item.props.label || "");
            }]
        ]);
        this.clean();
        document.querySelector("#form > div:nth-child(1)").innerHTML = "打卡表单：" + data.WFName;
        const container = document.querySelector("#form > div:nth-child(2)");
        const form = data.Form;
        container.innerHTML = "";
        if (this.blacklists.includes(data.Id)) return logger.log("该表单", data.Id, "存在于程序的黑名单之中，故不显示其内容。")
        this.wfid = data.Id;
        for (const item of form) {
            const {
                props,
                component
            } = item;
            const desc = `${props.extra ?props.extra+"，":""}${props.label||""}`;
            const itemElem = (supportComs.get(component) || supportComs.get("default"))(item, props.required, desc);
            container.append(itemElem);
        };
        const submitBtn = dom(`<button>提交表单</button>`);
        submitBtn.addEventListener("click", async e => {
            await this.fileHandler() && this.submit();
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