CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT,          -- 多个标签用逗号或空格隔开
  cover TEXT NOT NULL,  -- 封面图 URL (R2 外链)
  m3u8 TEXT NOT NULL,   -- R2 的 .m3u8 播放地址
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);