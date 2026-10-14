// Windows release 构建下隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    markdown_reader_lib::run()
}