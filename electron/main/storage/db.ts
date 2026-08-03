// lowdb 封装 + 启动初始化（数据库设计 §1.2 / §5 / §6.3）
//
// 文件：app.getPath('userData')/hikey-db.json。
// 初始化：读库（缺失则用默认根）→ migrate（迁移+归位）→ 仅在变更时原子写回。
// 迁移失败不破坏原库：migrate 全程在内存修改，仅成功后 write()（write 本身原子），
// 任何异常向上抛出，不落盘。

import { Low } from 'lowdb'
import { promises as fs } from 'fs'
import { join } from 'path'
import { AtomicJSONFile } from './adapter'
import { migrate } from './migrate'
import { defaultDbRoot, type DbRoot } from './schema'

let dbInstance: Low<DbRoot> | undefined

/**
 * 初始化存储。在 app.whenReady 后、创建窗口前调用。
 * @param userDataDir app.getPath('userData')
 * @throws 迁移/读写失败时抛出，调用方应中止启动（§5）。
 */
export async function initStorage(userDataDir: string): Promise<Low<DbRoot>> {
  const filePath = join(userDataDir, 'hikey-db.json')
  const adapter = new AtomicJSONFile<DbRoot>(filePath)
  const db = new Low<DbRoot>(adapter, defaultDbRoot())

  // 文件是否预先存在：缺失时 lowdb 用默认根，初始化后需落盘物化。
  let preexisted = true
  try {
    await fs.stat(filePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') preexisted = false
    else throw err
  }

  await db.read()

  // migrate 在内存中完成；变更或文件首次缺失时写回（原子）。
  // 迁移失败不破坏原库：migrate 全程内存修改，仅成功后 write()，write 本身原子。
  const { changed } = migrate(db.data)
  if (changed || !preexisted) {
    await db.write()
  }

  dbInstance = db
  return db
}

/** 取已初始化的 db 实例（供后续里程碑的 IPC 层使用）。未初始化时抛错。 */
export function getDb(): Low<DbRoot> {
  if (!dbInstance) {
    throw new Error('storage not initialized — call initStorage() first')
  }
  return dbInstance
}