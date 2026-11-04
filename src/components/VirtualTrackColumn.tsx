import React from "react";
import {
  TrackColumnProps,
  TrackColumn,
  trackColumnAreEqual,
} from "./TrackColumn";

// ---------------------------------------------------------------------------
// 直接渲染整列（已移除列级虚拟化）。
//
// 之前：只有进入近圈的列才挂载完整内容、退出远圈才卸载，甩动期间还会延后挂载，
// 离屏列渲染的是骨架占位，并配套了卸载/挂载限速队列与滚动空闲通知。
// 现在：所有列一律渲染完整内容，不再有任何基于可见性或滚动速度的分支。
// 外层这个 div 与原「完整列」分支完全一致，DOM 结构和布局保持不变。
// ---------------------------------------------------------------------------

export const VirtualTrackColumn = React.memo(function VirtualTrackColumn(
  props: TrackColumnProps,
) {
  return (
    <div className="h-full flex-shrink-0 flex items-stretch">
      <TrackColumn {...props} />
    </div>
  );
}, trackColumnAreEqual);