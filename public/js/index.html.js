class tool {
    static b64en(data) {
        return window.btoa(encodeURIComponent(data));
    };
    static b64de(data) {
        return decodeURIComponent(window.atob(data));
    };
    static loadjs(url, callback) {
        let js = document.createElement("script");
        js.src = url;
        js.onload = () => {
            callback && callback();
        };
        document.head.append(js);
    };
    static showinfo(info) {
        let infobox = document.querySelector("#result")
        infobox.innerHTML = "";
        for (let i of info) {
            if (i[0] == "text") {
                var text = document.createElement("div");
                text.textContent = i[1];
                infobox.append(text);
            }
            if (i[0] == "link") {
                var link = document.createElement("a");
                link.target = "_blank";
                link.textContent = i[1];
                link.href = i[1];
                infobox.append(link);
            }
        }
    };
    static getQueryVariable(variable) {
        let query = new URLSearchParams(window.location.search);
        if (query.has(variable)) {
            return query.get(variable);
        };
        return false;
    };
}
class Submit {
    constructor(Amap_key) {
        this.maindata = {
            wfid: 0,
            account: "",
            passwd: "",
            submit: {}
        };
        this.submit = {};
        tool.loadjs("https://webapi.amap.com/loader.js", async () => {
            this.AMap = await AMapLoader.load({
                key: Amap_key,
                version: "2.0",
                plugins: ["AMap.ToolBar", "AMap.Scale", "AMap.Geocoder"],
            });
        });
    };
    addaccount(account, passwd) {
        this.maindata.account = account;
        this.maindata.passwd = passwd;
    };
    loadjson(res) {
        for (let el of document.querySelector("ul").children) el.getAttribute("blocktype") && el.remove();
        const loadMap = (id) => {
            let container = document.querySelector("#" + id);
            if (!container || container.getAttribute("used")) return false;
            let the_marker = "";
            let map = new this.AMap.Map(id, {
                zoom: 11
            });
            map.addControl(new this.AMap.Scale());
            map.addControl(new this.AMap.ToolBar({
                position: {
                    left: 5,
                    top: 5
                },
                offset: [10, 10]
            }));
            map.on('click', (e) => {
                the_marker && the_marker.remove();
                new this.AMap.Geocoder({
                    city: '010'
                }).getAddress(e.lnglat, (status, result) => {
                    if (status != 'complete' || result.info != 'OK') return false;
                    let marker = new this.AMap.Marker({
                        position: new this.AMap.LngLat(e.lnglat.getLng(), e.lnglat.getLat()),
                        icon: 'https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png',
                        anchor: 'bottom-center',
                        title: result.regeocode.formattedAddress
                    });
                    map.add(marker);
                    the_marker = marker;
                    container.setAttribute("data", JSON.stringify({
                        longitude: e.lnglat.getLng(),
                        latitude: e.lnglat.getLat(),
                        address: result.regeocode.formattedAddress,
                        time: "{{time}}",
                    }));
                    container.setAttribute("positioned", true);
                    container.previousElementSibling.previousElementSibling.innerHTML = "获取定位：" + result.regeocode.formattedAddress;
                });
            });
            container.setAttribute("used", true);
        };
        const AutoTakePosition = (el) => {
            el.setAttribute("blocktype", "autoposition");
            let container = document.createElement("div");
            container.id = "pos_select";
            container.style = "width: 90%;height: 400px;";
            el.append(container);
            return el;
        };
        const AreaSelect = (el) => {
            el.setAttribute("blocktype", "position");
            for (let x = 0; x < 3; x++) {
                var input = document.createElement("input");
                input.type = "text";
                input.placeholder = "分别填写省、市、区县";
                el.append(input);
            };
            return el;
        };
        const Radio = (el, id, props) => {
            el.setAttribute("blocktype", "radio");
            for (let x of props.options) {
                let input = document.createElement("input"),
                    span = document.createElement("span"),
                    br = document.createElement("br");
                input.type = "radio";
                input.name = id;
                input.value = x;
                span.textContent = x;
                el.append(input);
                el.append(span);
                el.append(br);
            };
            return el;
        };
        const Text = (el) => {
            el.setAttribute("blocktype", "text");
            let input = document.createElement("input");
            input.type = "text";
            el.append(input);
            return el;
        };
        const Checkbox = (el, id, props) => {
            el.setAttribute("blocktype", "checkbox");
            for (let x of props.options) {
                let input = document.createElement("input"),
                    span = document.createElement("span"),
                    br = document.createElement("br");
                input.type = "checkbox";
                input.name = id;
                input.value = x;
                span.textContent = x;
                el.append(input);
                el.append(span);
                el.append(br);
            };
            return el;
        };
        var ul = document.querySelector("ul"),
            json_ = res.data,
            wfid = json_.Id;
        if (app.bl.includes(wfid)) return false;
        document.querySelector("#formname").textContent = json_.WFName;
        for (let form of json_.Form) {
            let props = form.props;
            if (!props.required) continue;
            let id = form.id,
                el = document.createElement("li"),
                desc = document.createElement("span"),
                br = document.createElement("br");
            el.id = id;
            desc.textContent = ((props.extra)) ? props.label + "，" + props.extra : props.label;
            el.append(desc);
            el.append(br);
            switch (form.component) {
                case "AutoTakePosition":
                    el = AutoTakePosition(el);
                    break;
                case "AreaSelect":
                    el = AreaSelect(el);
                    break;
                case "Radio":
                    el = Radio(el, id, props);
                    break;
                case "Input":
                case "Textarea":
                    el = Text(el);
                    break;
                case "Checkbox":
                    el = Checkbox(el, id, props);
                    break;
                default:
                    console.log("未知或不支持自动化打卡的表单项目：", form.component);
                    break;
            }
            ul.append(el);
            loadMap("pos_select");
        };
        this.maindata.wfid = wfid;
        return true;
    };
    buildjson(id) {
        let data;
        let el = document.getElementById(id);
        let type = el.getAttribute("blocktype") ? el.getAttribute("blocktype") : null;
        switch (type) {
            case "autoposition":
                if (!el.querySelector("#pos_select").getAttribute("positioned")) break;
                data = JSON.parse(el.querySelector("#pos_select").getAttribute("data"));
                break;
            case "position":
                data = [];
                for (let i = 0; i < 3; i++) {
                    data[i] = el.querySelectorAll("input")[i].value;
                };
                break;
            case "radio":
                var inputs = el.querySelectorAll("input");
                for (let input of inputs) {
                    if (input.checked == true) {
                        data = input.value;
                        break;
                    };
                };
                break;
            case "text":
                data = el.querySelectorAll("input")[0].value;
                break;
            case "checkbox":
                data = [];
                var inputs = el.querySelectorAll("input");
                for (let i = 0; i < inputs.length; i++) {
                    if (inputs[i].checked == true) {
                        data[i] = inputs[i].value;
                    };
                };
                data = data.filter((item) => item);
                break;
            default:
                break;
        };
        this.submit[id] = data;
    };
    async postdata(url) {
        tool.showinfo([
            ["text", "请求数据中……"]
        ]);
        try {
            let res = await fetch(url, {
                headers: {
                    "content-type": "application/json;charset=UTF-8"
                },
                method: "POST",
                body: JSON.stringify(this.fulljson)
            });
            let json = await res.json();
            switch (json.code) {
                case 0:
                case 1:
                    tool.showinfo([
                        ["text", "时间：" + json.ts],
                        ["text", json.msg],
                        ["text", "5分钟后重试。"],
                    ]);
                    setTimeout(() => {
                        location.reload()
                    }, 300000);
                    break;
                case 2:
                    let result = this.loadjson(json.fullmsg);
                    if (result) {
                        tool.showinfo([
                            ["text", "时间：" + json.ts],
                            ["text", "任务id出错，正确的id："],
                            ["text", json.msg],
                            ["text", "该id对应的表单已经解析完成。"],
                        ]);
                    } else {
                        tool.showinfo([
                            ["text", "获取打卡表单时发现了过期的表单。"],
                            ["text", "其id为 " + json.msg],
                            ["text", "5分钟后重试。"],
                        ]);
                        setTimeout(() => {
                            location.reload()
                        }, 300000);
                    };
                    break;
                case 3:
                    tool.showinfo([
                        ["text", "时间：" + json.ts],
                        ["text", "打卡成功，分享链接："],
                        ["link", json.msg],
                    ]);
                    history.pushState(200, "", window.location.origin + window.location.pathname + "?sign_data=" + encodeURIComponent(tool.b64en(JSON.stringify(this.fulljson))));
                    break;
                default:
                    break;
            };
        } catch (err) {
            tool.showinfo([
                ["text", "处理数据时出现问题，5分钟后重试。"]
            ]);
            setTimeout(() => {
                location.reload()
            }, 300000);
            console.error(err);
        };
    };
    get fulljson() {
        this.maindata.submit = JSON.stringify(this.submit);
        return this.maindata;
    };
};
const app = {
    bl: [],
    submit: "",
    init: async function () {
        window._AMapSecurityConfig = {
            serviceHost: window.location.origin + '/_AMapService',
        };
        let burl = "b"; //判断手机端还是移动端，并请求相应的html和css
        if (navigator.userAgent.match(/(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i)) {
            document.head.append(new DOMParser().parseFromString('<link rel="stylesheet" href="/css/mobile.css" type="text/css">', 'text/html').head.children[0])
            document.head.append(new DOMParser().parseFromString('<meta http-equiv="X-UA-Compatible" content="IE=edge">', 'text/html').head.children[0])
            document.head.append(new DOMParser().parseFromString('<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">', 'text/html').head.children[0])
            burl = "b-mobile"; //移动端总算可以看了（才怪
        } else {
            document.head.append(new DOMParser().parseFromString('<link rel="stylesheet" href="/css/main.css" type="text/css">', 'text/html').head.children[0])
        };
        await fetch("/yiban?r=" + burl) //请求html
            .then(res => res.text())
            .then((text) => {
                document.body.innerHTML = text;
                document.title = "易班快速打卡";
                document.querySelector("#sendData").addEventListener("click", (e) => {
                    e.currentTarget.setAttribute("disabled", "disabled");
                    app.send().finally(() => document.querySelector("#sendData").removeAttribute("disabled"));
                });
            }).catch(err => console.error(err));
        await fetch("/yiban?r=a") //加载公告
            .then(res => res.json())
            .then((json) => {
                for (let i of json) {
                    var div = document.createElement("div");
                    div.innerHTML = i;
                    document.querySelector("#desc").append(div);
                };
            }).catch(err => console.error(err));
        await fetch("/yiban?r=bl") //加载黑名单
            .then(res => res.json())
            .then(json => app.bl = json).catch(err => console.error(err));
        await fetch("/yiban?r=Amap") //请求Amap_key，以加载地图组件
            .then(res => res.text())
            .then(text => this.submit = new Submit(text))
            .catch(err => console.error(err));
        var sign_data = tool.getQueryVariable("sign_data"); //加载已有的sign_data数据
        if (!sign_data) return;
        try {
            var data = JSON.parse(tool.b64de(decodeURIComponent(sign_data)));
            document.querySelector("#sign_data").value = sign_data;
            document.querySelector("#account").value = data.account;
            document.querySelector("#passwd").value = data.passwd;
            this.submit.maindata.wfid = data.wfid;
            document.querySelector("#sendData").click();
        } catch (err) {
            try {
                var data = JSON.parse(decodeURIComponent(sign_data));
                history.pushState(200, "", window.location.origin + window.location.pathname + "?sign_data=" + encodeURIComponent(tool.b64en(JSON.stringify(data))));
                tool.showinfo([
                    ["text", "sign_data的数据格式不正确。将于5秒钟后以更正格式的数据重载。"]
                ]);
                setTimeout(() => {
                    location.reload()
                }, 5000);
            } catch (err) {
                tool.showinfo([
                    ["text", "sign_data的数据格式不正确。可能是复制链接时遗漏了字符？"]
                ]);
            };
        };
    },
    send: async function () {
        var lis = document.querySelectorAll("li");
        if (!document.querySelector("#account").value | !document.querySelector("#passwd").value) return tool.showinfo([
            ["text", "没有填入账号密码！"]
        ]);
        this.submit.addaccount(document.querySelector("#account").value, document.querySelector("#passwd").value);
        if (lis.length > 1) {
            for (let li of lis) {
                this.submit.buildjson(li.id);
            };
            document.querySelector("#sign_data").value = tool.b64en(JSON.stringify(this.submit.fulljson));
        } else if (document.querySelector("#sign_data").value) {
            this.submit.submit = JSON.parse(JSON.parse(tool.b64de(decodeURIComponent(document.querySelector("#sign_data").value))).submit);
        };
        await this.submit.postdata("/yiban?r=e");
    }
};