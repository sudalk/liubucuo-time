import { useEffect, useState } from "react";
import { useToastStore } from "../stores/toast";
import { useRouteStore } from "../stores/route";
import { api } from "../api/client";

interface NeedData {
  rawText: string;
  structured: string | null;
}

export function TimeNeed() {
  const navigate = useRouteStore((s) => s.navigate);
  const showToast = useToastStore((s) => s.show);
  const [rawText, setRawText] = useState("");
  const [structured, setStructured] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { need } = await api.get<{ need: NeedData | null }>("/api/profile/need");
      setRawText(need?.rawText ?? "");
      setStructured(need?.structured ?? null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    try {
      await api.put("/api/profile/need", { rawText });
      showToast("已保存");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const generateStructured = async () => {
    if (!rawText.trim()) {
      showToast("请先填写自由描述");
      return;
    }
    setAiLoading(true);
    try {
      // 用日关键词接口的同类调用：直接走 llmChatJSON
      const result = await api.post<{ goals: string[]; scenarios: string[]; constraints: string[]; improvements: string[] }>(
        "/api/ai/need-summary",
        { rawText }
      );
      const text = `目标：${result.goals.join("、")}\n场景：${result.scenarios.join("、")}\n约束：${result.constraints.join("、")}\n改善：${result.improvements.join("、")}`;
      setStructured(text);
      await api.put("/api/profile/need", { rawText, structured: result });
      showToast("已生成结构化目标并保存");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI 调用失败");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="sketch-screen" aria-label="时间管理需求页">
      <div className="sketch-content">
        <div className="page-head">
          <div>
            <p className="eyebrow">个人</p>
            <h1>时间管理需求</h1>
            <p className="subtle">描述你的管理目标、场景、约束和希望改善的问题。AI 整理为结构化目标，只用于推荐和分析。</p>
          </div>
          <div className="head-actions">
            <button className="btn btn-soft" onClick={() => navigate("settings")}>返回设置</button>
          </div>
        </div>

        {loading ? (
          <div className="empty"><span className="subtle">加载中…</span></div>
        ) : (
          <div className="viz-panel">
            <div className="profile-field">
              <label>自由描述</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="例如：我想改善深度工作的连续性，每天能保证 2-3 小时不受打扰。工作日晚上主要用于学习和家务，周末想留出时间运动。"
                style={{ minHeight: 140 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={save}>保存</button>
              <button className="btn btn-tint" onClick={generateStructured} disabled={aiLoading}>
                {aiLoading ? "AI 整理中…" : "AI 整理为结构化目标"}
              </button>
            </div>

            {structured && (
              <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "var(--paper)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                <strong>结构化目标：</strong>
                {"\n" + structured}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
