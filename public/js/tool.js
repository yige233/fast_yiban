function dom(str) {
    const body = new DOMParser().parseFromString(str, 'text/html').body.children[0];
    return body || new DOMParser().parseFromString(str, 'text/html').head.children[0];
};

class Base64 { //憋出一个Base64编解码的class，我是超级大憨批
    static get key() {
        return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".split("");
    };
    static encode(data) {
        let code2 = "";
        const result = [];
        for (let i of data.split("")) { //
            const charCode2 = i.charCodeAt(0).toString(2);
            if (i.charCodeAt(0) < 128) { //这里要补足8位
                code2 += charCode2.padStart(8, 0);
            } else { //这之外的字符，就不是btoa能处理的了，需要将unicode转换为utf-8
                let bytes = 1; //表示utf8将占用的字节数
                const utf8 = [];
                const uni2 = charCode2.split("").reverse().join(""); //将字符串反转，便于从低位开始操作
                for (let i = 0; i < uni2.length; i += 6) {
                    const byte = uni2.slice(i, i + 6).split(""); //获取低6位，这时它还是反转的状态，所以下面的操作也要反着来
                    if (byte.length != 6) { //byte的长度不足6，说明它已经是最高位了
                        while (byte.length < 8 - bytes) byte.push(0); //中间用0补足至 8 - bytes 位
                        while (byte.length < 8) byte.push(1); //最高位用1填充，共填充 bytes 位，达到8位
                        utf8.push(...byte);
                        break;
                    };
                    utf8.push(...byte, 0, 1); //低位向前补上"10"，变成8位
                    bytes++;
                };
                code2 += utf8.reverse().join(""); //这里再给它反转回来
            };
        };
        for (let i = 0; i < code2.length; i += 6) { //原来每8位占用一个字节，现在改用每6位，不足6位的补0，然后查表，变成base64编码
            result.push(this.key[parseInt(code2.slice(i, i + 6).padEnd(6, 0), 2)]);
        };
        while (true) { //末尾根据情况补充"="
            if (result.length % 4 == 0) break;
            result.push("=");
        };
        return result.join("");
    };
    static decode(data) {
        //什么邪道??? ==> fetch(`data:text/plain;charset=utf-16;base64,${data}`).then(res => res.text());
        let code2 = "";
        let pointer = 0; //定义一个指针，方便查找字符串分割到哪了
        const result = [];
        for (let char of data.split("")) { //查表，把base64编码变回二进制
            if (char == "=") continue;
            code2 += (this.key.findIndex(i => i == char)).toString(2).padStart(6, 0);
        };
        while (pointer < code2.length - code2.length % 8) { //这里是为了避免解码出\x00 ，要把code2最后不够8位的部分舍弃掉
            let bytes = 1; //编码的字节数
            let uni = "";
            if (code2.charAt(pointer) == "0") { //看起来这是个普通的ascii编码
                result.push(String.fromCharCode(parseInt(code2.slice(pointer, pointer + 8), 2)));
                pointer += 8;
                continue;
            };
            while (true) { //看起来这是一个utf8编码
                if (code2.charAt(pointer + bytes) == "1") { //判断编码的字节数
                    uni += code2.slice(pointer + (8 * bytes) + 2, pointer + 8 * (bytes + 1)); //获取对应字节的低6位，接在 uni 的后面
                    bytes++;
                    continue;
                };
                result.push(String.fromCharCode(parseInt(code2.slice(pointer + bytes, pointer + 8) + uni, 2))); //最后把剩下的接在 uni 的前面
                pointer += 8 * bytes;
                break;
            };
        };
        return result.join("");
    };
};

function createTab(container) {
    const tabs = [];
    const tabHeader = container.querySelector(".tabHeader");
    const tabBody = container.querySelector(".tabBody");
    for (let i of tabHeader.children) tabs.push(i);
    for (let index in tabs) {
        const thisIndex = index;
        tabs[index].addEventListener("mouseover", () => {
            for (let i in tabs) {
                if (i != thisIndex && tabs[i].classList.contains("show")) {
                    tabs[i].classList.remove("show");
                    tabBody.children[i].setAttribute("style", "display:none");
                };
            };
            tabs[thisIndex].classList.add("show");
            tabBody.children[thisIndex].setAttribute("style", "display:block");
        });
    };
};

function randomID(length = 32, base = 16) { //不敢说这样搞出来的叫uuid，最多叫id
    const id = [];
    const array = new Uint32Array(length);
    base = (base < 2) ? 2 : (base > 36) ? 36 : base;
    if (!window.crypto.getRandomValues) {
        throw new Error("浏览器不支持crypto模块，或者crypto模块缺少getRandomValues方法");
    };
    window.crypto.getRandomValues(array);
    for (let i of array) {
        const str = i.toString(base);
        id.push(str.slice(str.length - 1, str.length));
    };
    return id.join("");
};

class Log {
    constructor(container) {
        this.container = container;
    };
    log(...text) {
        if (this.container.querySelector("h2")) this.container.querySelector("h2").remove();
        this.container.append(dom(`<div>${new Date().toLocaleTimeString()} ${text.join(" ")}</div>`));
        this.container.scrollTo({
            top: this.container.scrollHeight,
            left: 0,
            behavior: 'smooth'
        });
    };
};

export {
    dom,
    Base64,
    createTab,
    randomID,
    Log
};