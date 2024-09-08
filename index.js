


const WebSocket = require('ws');

let ws;

// 定义加入频道的命令
const joinCommand = {
    cmd: 'join',
    nick: 'wonder_bot',
    pass: 'RH8CzwIV9NLT67Lc',
    channel: 'loungee'
};

const authorizedTripcode = 'utcAWA';
const allowedTripcodes = new Set([authorizedTripcode]);

const restrictedCommands = new Set(['send', 'allow', 'disallow', 'restart', 'exit', 'afk']);

const commands = {
    'send': '发送消息到频道。',
    'allow': '允许某个 tripcode 使用 .w send 命令（仅对授权 tripcode 有效）。',
    'disallow': '移除某个 tripcode 使用 .w send 命令的权限（仅对授权 tripcode 有效）。',
    'list': '列出所有被允许使用 .w send 命令的 tripcodes（对所有人可见）。',
    'restart': '通过离开并重新加入频道来重启机器人（仅对授权 tripcode 有效）。',
    'exit': '通过离开频道并终止进程来停止机器人（仅对授权 tripcode 有效）。',
    'afk': '将用户标记为 AFK 并通知频道（用户的 tripcode 或名字）。'
};

const afkUsers = new Map();

function startWebSocket() {
    ws = new WebSocket('wss://wsproxy.inf.us.kg/?wss://hack.chat/chat-ws');

    ws.on('open', () => {
        console.log('已连接到 hack.chat');
        ws.send(JSON.stringify(joinCommand));
        sendChatMessage('allow 掉线了');

        // 每五秒发送 “/” 并处理收到的消息
        setInterval(() => {
            ws.send(JSON.stringify({ cmd: 'chat', text: '/' }));
        }, 5000);
    });

    ws.on('message', (data) => {
        console.log('接收到原始消息:', data);
        let message;
        try {
            message = JSON.parse(data);
        } catch (error) {
            console.error('解析消息失败:', data);
            return;
        }
        console.log('解析后的消息:', message);

        if (message.cmd === 'chat') {
            handleChatMessage(message);
        } else if (message.cmd === 'onlineAdd') {
            handleOnlineAddMessage(message);
        } else if (message.cmd === 'onlineRemove') {
            handleOnlineRemoveMessage(message);
        } else if (message.cmd === 'info' && message.type === 'whisper') {
            handlePrivateMessage(message);
        } else if (message.cmd === 'warn') {
            if (message.channel !== 'lounge') {
                if (message.channel !== 'loungee') {
                    console.log(`频道 ${message.channel} 不正确，重新加入 loungee`);
                    ws.close(); // 断开连接
                    startWebSocket(); // 重新连接
                    return;
                }
            }
        }
    });

    ws.on('close', () => {
        console.log('与 hack.chat 的连接已断开');
    });

    ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
    });
}

function handleChatMessage(message) {
    if (message.text.startsWith('.w ')) {
        const command = message.text.slice(3).trim(); // 提取命令内容
        if (command === 'help') {
            sendHelpMessage(message.trip);
        } else if (command.startsWith('help ')) {
            sendCommandHelp(command, message.trip);
        } else if (command === 'list') {
            sendListMessage();
        } else if (command === 'restart') {
            if (message.trip === authorizedTripcode) {
                handleRestartCommand();
            } else {
                sendChatMessage('你没有权限使用 .w restart 命令。');
                console.log(`未经授权的 tripcode ${message.trip} 尝试使用 .w restart`);
            }
        } else if (command === 'exit') {
            if (message.trip === authorizedTripcode) {
                handleExitCommand();
            } else {
                sendChatMessage('你没有权限使用 .w exit 命令。');
                console.log(`未经授权的 tripcode ${message.trip} 尝试使用 .w exit`);
            }
        } else if (command === 'afk') {
            handleAfkCommand(message);
        } else if (message.trip === authorizedTripcode || allowedTripcodes.has(message.trip)) {
            handleSpecialCommands(command);
        } else if (command.startsWith('send ') && allowedTripcodes.has(message.trip)) {
            handleSendCommand(command);
        } else {
            console.log(`未经授权的 tripcode ${message.trip} 尝试使用命令`);
        }
    } else if (afkUsers.has(message.trip)) {
        const userNick = afkUsers.get(message.trip);
        sendChatMessage(`${userNick}, 欢迎回来`);
        afkUsers.delete(message.trip);
    }
}

// 处理用户加入频道的消息
function handleOnlineAddMessage(message) {
    if (message.cmd === 'onlineAdd') {
        const { nick, channel } = message;
        if (channel === joinCommand.channel) {
            sendChatMessage(`你好，${nick}`);
            console.log(`向 ${nick} 发送了欢迎消息`);
        }
    }
}

// 处理用户离开频道的消息
function handleOnlineRemoveMessage(message) {
    if (message.cmd === 'onlineRemove') {
        console.log(`用户 ${message.nick} 离开了频道 ${message.channel}`);
    }
}

// 处理私聊消息
function handlePrivateMessage(message) {
    if (message.cmd === 'info' && message.type === 'whisper') {
        const { from, text } = message;
        sendWhisperMessage(from, `你收到了私聊: ${text}`);
        console.log(`处理了来自 ${from} 的私聊消息: ${text}`);
    }
}

// 处理 .w help 命令
function sendHelpMessage(tripcode) {
    let helpText = '命令列表：\n';
    const commandNames = [];
    
    for (const cmd of Object.keys(commands)) {
        if (cmd === 'allow' || cmd === 'disallow') {
            if (tripcode !== authorizedTripcode && !allowedTripcodes.has(tripcode)) {
                continue;
            }
        } else if (cmd === 'send') {
            if (!allowedTripcodes.has(tripcode) && tripcode !== authorizedTripcode) {
                continue;
            }
        } else if ((cmd === 'restart' || cmd === 'exit') && tripcode !== authorizedTripcode) {
            continue;
        }
        commandNames.push(cmd);
    }
    
    helpText += `${commandNames.join(',')}`;
    helpText += '\n使用 .w help <命令名> 获取命令具体作用';
    
    sendChatMessage(helpText.trim());
    console.log('发送了包含命令列表的帮助消息。');
}

// 处理 .w help <cmd> 命令
function sendCommandHelp(command, tripcode) {
    const cmd = command.slice('help '.length).trim();
    if (commands.hasOwnProperty(cmd)) {
        if (cmd === 'send') {
            if (!allowedTripcodes.has(tripcode) && tripcode !== authorizedTripcode) {
                sendChatMessage('此命令不存在');
                console.log(`未经授权的 tripcode ${tripcode} 尝试访问 .${cmd} 的帮助`);
                return;
            }
        } else if ((cmd === 'restart' || cmd === 'exit') && tripcode !== authorizedTripcode) {
            sendChatMessage('此命令不存在');
            console.log(`未经授权的 tripcode ${tripcode} 尝试访问 .${cmd} 的帮助`);
            return;
        } else if (cmd === 'allow' || cmd === 'disallow') {
            if (tripcode !== authorizedTripcode && !allowedTripcodes.has(tripcode)) {
                sendChatMessage('此命令不存在');
                console.log(`未经授权的 tripcode ${tripcode} 尝试访问 .${cmd} 的帮助`);
                return;
            }
        }
        sendChatMessage(`.${cmd}: ${commands[cmd]}`);
        console.log(`发送了命令 ${cmd} 的帮助信息`);
    } else {
        sendChatMessage('此命令不存在');
        console.log(`命令 .${cmd} 不存在`);
    }
}

// 处理 .w list 命令
function sendListMessage() {
    if (allowedTripcodes.size === 0) {
        sendChatMessage('没有 tripcodes 被允许使用 .w send 命令。');
    } else {
        let listText = '被允许的 tripcodes:\n';
        for (const trip of allowedTripcodes) {
            listText += `${trip}\n`;
        }
        sendChatMessage(listText.trim());
    }
    console.log('发送了允许的 tripcodes 列表。');
}

// 处理特殊命令
function handleSpecialCommands(command) {
    if (command.startsWith('allow ')) {
        handleAllowCommand(command);
    } else if (command.startsWith('disallow ')) {
        handleDisallowCommand(command);
    } else if (command.startsWith('send ')) {
        handleSendCommand(command);
    }
}

// 处理 .w allow <tripcode> 命令
function handleAllowCommand(command) {
    const tripcode = command.slice('allow '.length).trim();
    if (tripcode && !allowedTripcodes.has(tripcode)) {
        allowedTripcodes.add(tripcode);
        sendChatMessage(`Tripcode ${tripcode} 现在被允许使用 .w send 命令。`);
        console.log(`Tripcode ${tripcode} 已被允许`);
    } else {
        sendChatMessage('无效的 tripcode。');
    }
}

// 处理 .w disallow <tripcode> 命令
function handleDisallowCommand(command) {
    const tripcode = command.slice('disallow '.length).trim();
    if (tripcode && allowedTripcodes.has(tripcode)) {
        if (tripcode === authorizedTripcode) {
            sendChatMessage('你不能禁止你自己');
            console.log(`尝试禁止授权 tripcode ${tripcode} 的操作`);
            return;
        }
        allowedTripcodes.delete(tripcode);
        sendChatMessage(`Tripcode ${tripcode} 现在不能使用 .w send 命令。`);
        console.log(`Tripcode ${tripcode} 已被禁止`);
    } else {
        sendChatMessage('无效的 tripcode。');
    }
}

// 处理 .w send <message> 命令
function handleSendCommand(command) {
    const message = command.slice('send '.length).trim();
    if (message) {
        sendChatMessage(message);
        console.log(`发送消息: ${message}`);
    } else {
        sendChatMessage('消息不能为空。');
    }
}

// 处理 .w restart 命令
function handleRestartCommand() {
    console.log('重启机器人...');
    ws.close(); // 关闭当前 WebSocket 连接
    startWebSocket(); // 重新启动 WebSocket 连接
}

// 处理 .w exit 命令
function handleExitCommand() {
    console.log('停止机器人...');
    ws.close(); // 关闭 WebSocket 连接
    process.exit(0); // 退出进程
}

// 处理 .w afk 命令
function handleAfkCommand(message) {
    const userNick = message.text.slice(4).trim(); // 提取 AFK 用户的昵称或 tripcode
    if (userNick) {
        afkUsers.set(message.trip, userNick);
        sendChatMessage(`${userNick} 被标记为 AFK。`);
        console.log(`${userNick} 被标记为 AFK`);
    } else {
        sendChatMessage('请提供 AFK 用户的昵称或 tripcode。');
    }
}

// 发送消息到频道
function sendChatMessage(message) {
    ws.send(JSON.stringify({ cmd: 'chat', text: message }));
}

// 发送私聊消息
function sendWhisperMessage(to, message) {
    ws.send(JSON.stringify({ cmd: 'info', type: 'whisper', to, text: message }));
}



// 启动 WebSocket
startWebSocket();
