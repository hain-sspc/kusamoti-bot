const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createTemporaryPath(filePath) {
    const fileName = path.basename(filePath);
    const uniqueId = crypto.randomBytes(8).toString('hex');
    return path.join(path.dirname(filePath), `.${fileName}.${process.pid}.${uniqueId}.tmp`);
}

function logCleanupError(error, temporaryPath) {
    if (error.code !== 'ENOENT') {
        console.error(`一時ファイルの削除に失敗しました: ${temporaryPath}`, error);
    }
}

function writeFileAtomicSync(filePath, data, options = 'utf8') {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });

    const temporaryPath = createTemporaryPath(filePath);
    let fileDescriptor;

    try {
        fileDescriptor = fs.openSync(temporaryPath, 'wx');
        fs.writeFileSync(fileDescriptor, data, options);
        fs.fsyncSync(fileDescriptor);
        fs.closeSync(fileDescriptor);
        fileDescriptor = undefined;
        fs.renameSync(temporaryPath, filePath);
    } catch (error) {
        if (fileDescriptor !== undefined) {
            try {
                fs.closeSync(fileDescriptor);
            } catch (cleanupError) {
                console.error(`一時ファイルを閉じられませんでした: ${temporaryPath}`, cleanupError);
            }
        }

        try {
            fs.unlinkSync(temporaryPath);
        } catch (cleanupError) {
            logCleanupError(cleanupError, temporaryPath);
        }
        throw error;
    }
}

async function writeFileAtomic(filePath, data, options = 'utf8') {
    const directory = path.dirname(filePath);
    await fs.promises.mkdir(directory, { recursive: true });

    const temporaryPath = createTemporaryPath(filePath);
    let fileHandle;

    try {
        fileHandle = await fs.promises.open(temporaryPath, 'wx');
        await fileHandle.writeFile(data, options);
        await fileHandle.sync();
        await fileHandle.close();
        fileHandle = undefined;
        await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
        if (fileHandle) {
            try {
                await fileHandle.close();
            } catch (cleanupError) {
                console.error(`一時ファイルを閉じられませんでした: ${temporaryPath}`, cleanupError);
            }
        }

        try {
            await fs.promises.unlink(temporaryPath);
        } catch (cleanupError) {
            logCleanupError(cleanupError, temporaryPath);
        }
        throw error;
    }
}

function writeJsonSync(filePath, value, space = 2) {
    const serialized = JSON.stringify(value, null, space);
    if (serialized === undefined) {
        throw new TypeError('JSONとして保存できない値です。');
    }
    writeFileAtomicSync(filePath, serialized);
}

async function writeJson(filePath, value, space = 2) {
    const serialized = JSON.stringify(value, null, space);
    if (serialized === undefined) {
        throw new TypeError('JSONとして保存できない値です。');
    }
    await writeFileAtomic(filePath, serialized);
}

function appendFileSync(filePath, data, options = 'utf8') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, data, options);
}

function renameSync(fromPath, toPath) {
    fs.renameSync(fromPath, toPath);
}

module.exports = {
    writeFileAtomicSync,
    writeFileAtomic,
    writeJsonSync,
    writeJson,
    appendFileSync,
    renameSync
};