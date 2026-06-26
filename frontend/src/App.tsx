import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Code, Zap, Music, Languages, DollarSign, Paintbrush, Microscope,
  BarChart3, Dumbbell, Camera, Gamepad2, Brain, Scale, HeartPulse, Wrench,
  GraduationCap, Briefcase, FolderOpen, FileVideo, FileText, FileIcon, Code2,
  ChevronRight, ArrowLeft, Check, X, Loader, Plus, ExternalLink, Link, Download, ImageIcon, PanelLeftClose, PanelLeft, Home,
} from 'lucide-react';

const API = window.location.origin;
const THEME_LIST = [
  { name: 'default', label: 'Moonlight', icon: '🌑' },
  { name: 'sakura', label: 'Sakura', icon: '🌸' },
  { name: 'matcha', label: 'Matcha', icon: '🍵' },
  { name: 'starry', label: 'Starry', icon: '🌌' },
  { name: 'dusk', label: 'Dusk', icon: '🌆' },
  { name: 'aurora', label: 'Aurora', icon: '🌌' },
];

const COURSE_ICON_MAP: Record<string, any> = {
  Zap, Music, Languages, BookOpen, DollarSign, Code, Paintbrush, Microscope,
  BarChart3, Dumbbell, Camera, Gamepad2, Brain, Scale, HeartPulse, Wrench,
  GraduationCap, Briefcase,
};

const COURSE_ICON_LIST = [
  { key: "BookOpen", label: "Education" }, { key: "Code", label: "Programming" },
  { key: "Zap", label: "Electricity" }, { key: "Music", label: "Music" },
  { key: "Languages", label: "Language" }, { key: "DollarSign", label: "Finance" },
  { key: "Paintbrush", label: "Design" }, { key: "Microscope", label: "Science" },
  { key: "BarChart3", label: "Data" }, { key: "Dumbbell", label: "Fitness" },
  { key: "Camera", label: "Photography" }, { key: "Gamepad2", label: "Gaming" },
  { key: "Brain", label: "Psychology" }, { key: "Scale", label: "Law" },
  { key: "HeartPulse", label: "Medical" }, { key: "Wrench", label: "Engineering" },
  { key: "GraduationCap", label: "Academic" }, { key: "Briefcase", label: "Business" },
];

// ─── Theme-aware gradient hook ───
function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('nest_theme_dark');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    const check = () => {
      const saved = localStorage.getItem('nest_theme_dark');
      if (saved !== null) { setIsDark(saved === 'true'); return; }
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    };
    window.addEventListener('storage', check);
    // Also poll for theme toggle (no storage event for same-tab changes)
    const iv = setInterval(() => {
      const theme = document.documentElement.getAttribute('data-theme') || '';
      setIsDark(theme.endsWith('-dark'));
    }, 500);
    return () => { window.removeEventListener('storage', check); clearInterval(iv); };
  }, []);
  return isDark;
}

const COURSE_GRADIENTS: Record<string, string> = {
  BookOpen: "from-blue-600/30 to-indigo-900/60", Code: "from-emerald-600/30 to-cyan-900/60",
  Zap: "from-yellow-500/30 to-amber-900/60", Music: "from-pink-500/30 to-purple-900/60",
  Languages: "from-sky-500/30 to-blue-900/60", DollarSign: "from-green-500/30 to-emerald-900/60",
  Paintbrush: "from-rose-500/30 to-pink-900/60", Microscope: "from-teal-500/30 to-cyan-900/60",
  BarChart3: "from-violet-500/30 to-purple-900/60", Dumbbell: "from-orange-500/30 to-red-900/60",
  Camera: "from-amber-500/30 to-yellow-900/60", Gamepad2: "from-indigo-500/30 to-violet-900/60",
  Brain: "from-fuchsia-500/30 to-pink-900/60", Scale: "from-slate-500/30 to-gray-900/60",
  HeartPulse: "from-red-500/30 to-rose-900/60", Wrench: "from-zinc-500/30 to-stone-900/60",
  GraduationCap: "from-blue-500/30 to-sky-900/60", Briefcase: "from-neutral-500/30 to-slate-900/60",
};
const COURSE_GRADIENTS_LIGHT: Record<string, string> = {
  BookOpen: "from-blue-500/70 to-indigo-700/90", Code: "from-emerald-500/70 to-cyan-700/90",
  Zap: "from-yellow-400/70 to-amber-600/90", Music: "from-pink-500/70 to-purple-700/90",
  Languages: "from-sky-400/70 to-blue-700/90", DollarSign: "from-green-500/70 to-emerald-700/90",
  Paintbrush: "from-rose-500/70 to-pink-700/90", Microscope: "from-teal-500/70 to-cyan-700/90",
  BarChart3: "from-violet-500/70 to-purple-700/90", Dumbbell: "from-orange-500/70 to-red-700/90",
  Camera: "from-amber-400/70 to-yellow-600/90", Gamepad2: "from-indigo-500/70 to-violet-700/90",
  Brain: "from-fuchsia-500/70 to-pink-700/90", Scale: "from-slate-500/70 to-gray-700/90",
  HeartPulse: "from-red-500/70 to-rose-700/90", Wrench: "from-zinc-500/70 to-stone-700/90",
  GraduationCap: "from-blue-400/70 to-sky-700/90", Briefcase: "from-neutral-500/70 to-slate-700/90",
};

function countVideos(items: any[]): number {
  return items.reduce((n, i) => n + (i.type === "video" ? 1 : 0) + (i.children ? countVideos(i.children) : 0), 0);
}
function countWatched(items: any[], w: Record<string, boolean>): number {
  return items.reduce((n, i) => n + (i.type === "video" && w[i.path] ? 1 : 0) + (i.children ? countWatched(i.children, w) : 0), 0);
}

function CourseIcon({ iconKey, size = 20, className = "" }: { iconKey: string; size?: number; className?: string }) {
  const IC = COURSE_ICON_MAP[iconKey] || BookOpen;
  return <IC size={size} className={className} />;
}

const FILE_TYPE_ICONS: Record<string, any> = {
  video: FileVideo, image: ImageIcon, text: FileText, code: Code2,
  document: FileText, link: ExternalLink, folder: FolderOpen, other: FileIcon,
};

const parseCSV = (str: string) => {
  const firstLine = str.split('\n')[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  
  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let val = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      if (inQuotes && str[i + 1] === '"') { val += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(val.trim()); val = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(val.trim()); result.push(row); row = []; val = '';
    } else if (char !== '\r') {
      val += char;
    }
  }
  row.push(val.trim()); 
  if (row.length > 1 || val.trim() !== '') result.push(row);
  return result;
};

// ─── Theme Switcher ───
function ThemeSwitcher() {
  const [themeName, setThemeName] = useState(() => localStorage.getItem('nest_theme_name') || 'default');
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('nest_theme_dark');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const fullTheme = `${themeName}-${isDark ? 'dark' : 'light'}`;
    document.documentElement.setAttribute('data-theme', fullTheme);
  }, [themeName, isDark]);

  const selectTheme = (name: string) => {
    setThemeName(name);
    localStorage.setItem('nest_theme_name', name);
  };

  const toggleDark = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem('nest_theme_dark', String(newDark));
  };

  return (
    <div className="dropdown dropdown-end">
      <button tabIndex={0} className="btn btn-ghost btn-xs gap-1 text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100">
        🎨 Theme
      </button>
      <ul tabIndex={0} className="dropdown-content menu p-2 bg-base-200 border border-base-300 rounded-md shadow-2xl w-48 z-50">
        <li className="mb-2 border-b border-base-300 pb-2">
          <button onClick={toggleDark} className="text-xs flex items-center justify-between font-bold">
            <span className="flex items-center gap-2">{isDark ? '🌙' : '☀️'} {isDark ? 'Dark Mode' : 'Light Mode'}</span>
            <input type="checkbox" className="toggle toggle-xs toggle-primary pointer-events-none" checked={isDark} readOnly />
          </button>
        </li>
        {THEME_LIST.map(t => (
          <li key={t.name}>
            <button
              onClick={() => selectTheme(t.name)}
              className={`text-xs flex items-center gap-2 ${themeName === t.name ? 'bg-primary/10 text-primary font-bold' : ''}`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Course Card ───
function CourseCard({ course, onClick, onDelete }: { course: any; onClick: () => void; onDelete: () => void }) {
  const isDark = useIsDark();
  const gradient = (isDark ? COURSE_GRADIENTS : COURSE_GRADIENTS_LIGHT)[course.icon] || (isDark ? COURSE_GRADIENTS.BookOpen : COURSE_GRADIENTS_LIGHT.BookOpen);
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col p-4 bg-gradient-to-br ${gradient} border border-base-300 rounded-md card-hover text-left overflow-hidden group`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-base-100/20">
          <CourseIcon iconKey={course.icon} size={20} className="text-primary" />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity btn btn-ghost btn-xs btn-square"
        >
          <X size={12} />
        </button>
      </div>
      <div className="font-bold text-sm leading-tight mb-1">{course.name}</div>
      {course.subtitle && <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">{course.subtitle}</div>}
      <div className="text-[9px] font-bold uppercase tracking-widest opacity-40 mt-auto">
        {course.totalVideos} videos
      </div>
    </button>
  );
}

// ─── CourseDetailOverlay ───
function CourseDetailOverlay({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeFile, setActiveFile] = useState<any>(null);
  const [fileContent, setFileContent] = useState<any>(null);
  const [watched, setWatched] = useState<Record<string, boolean>>({});
  const [viewTab, setViewTab] = useState<"preview" | "code">("preview");
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    fetch(`${API}/api/courses/${courseId}/progress`)
      .then(r => r.json()).then(d => setWatched(d || {})).catch(() => {});
    fetch(`${API}/api/courses/${courseId}/browse`)
      .then(r => r.json()).then(d => {
        setData(d);
        setLoading(false);

        // Restore file from URL ?file= param (deep-link / reload / back-button)
        const urlFile = new URLSearchParams(location.search).get('file');

        // Find the file and its parent chain to expand
        const findParentChain = (nodes: any[], targetPath: string, chain: string[] = []): string[] | null => {
          for (const n of nodes) {
            if (n.path === targetPath) return chain;
            if (n.children) {
              const result = findParentChain(n.children, targetPath, [...chain, n.path]);
              if (result) return result;
            }
          }
          return null;
        };
        const findFile = (nodes: any[], path: string): any => {
          for (const n of nodes) {
            if (n.path === path) return n;
            if (n.children) { const f = findFile(n.children, path); if (f) return f; }
          }
          return null;
        };

        const restorePath = urlFile || localStorage.getItem(`nest_last_played_${courseId}`);
        if (restorePath && d?.items) {
          const parentChain = findParentChain(d.items, restorePath);
          const initExp: Record<string, boolean> = {};
          if (parentChain) parentChain.forEach(p => { initExp[p] = true; });
          setExpanded(initExp);
          if (urlFile) {
            const file = findFile(d.items, urlFile);
            if (file) setActiveFile(file);
          }
        } else {
          // No restore path: expand all top-level folders
          const initExp: Record<string, boolean> = {};
          d?.items?.forEach((i: any) => { if (i.type === "folder") initExp[i.path] = true; });
          setExpanded(initExp);
        }
      })
      .catch(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    const loadPrism = () => {
      if ((window as any).Prism) {
        (window as any).Prism.highlightAll();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js";
      script.dataset.manual = "true";
      script.onload = () => {
        const langs = ["javascript", "typescript", "python", "css", "json", "bash", "markdown", "c", "cpp", "java"];
        let loaded = 0;
        langs.forEach(l => {
          const s = document.createElement("script");
          s.src = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${l}.min.js`;
          s.onload = () => { loaded++; if (loaded === langs.length) (window as any).Prism?.highlightAll(); };
          document.head.appendChild(s);
        });
      };
      document.head.appendChild(script);
    };
    if (activeFile && (activeFile.type === "code" || activeFile.type === "text") && fileContent) {
      loadPrism();
    }
  }, [activeFile, fileContent]);

  const toggleExpand = (path: string) => {
    setExpanded(p => ({ ...p, [path]: !p[path] }));
  };

  const isAnyExpanded = Object.values(expanded).some(Boolean);
  const toggleAll = () => {
    if (isAnyExpanded) {
      setExpanded({});
    } else {
      const allExp: Record<string, boolean> = {};
      const setAll = (nodes: any[]) => {
        nodes.forEach(n => {
          if (n.type === "folder") {
            allExp[n.path] = true;
            if (n.children) setAll(n.children);
          }
        });
      };
      setAll(data?.items || []);
      setExpanded(allExp);
    }
  };

  const renderCurriculum = (items: any[], level = 0) => {
    return items.map((item: any, index: number) => {
      const isFirst = index === 0;
      const isLast = index === items.length - 1;
      const parentLeft = `calc(${level * 1}rem + 6px)`;
      const currentLeft = `calc(${(level + 1) * 1}rem + 6px)`;
      const isExp = expanded[item.path];
      const hasChildren = item.children && item.children.length > 0;
      const isExpandedFolder = item.type === "folder" && isExp && hasChildren;

      const renderSnakeLines = (isWatched = false) => {

        // Top Half Line (0% to 50%)
        const topHalf = level > 0 && isFirst ? (
          <div 
            className="absolute top-0 pointer-events-none"
            style={{
              left: parentLeft,
              bottom: '50%',
              width: 'calc(1rem + 2px)',
              zIndex: 0
            }}
          >
            <svg 
              preserveAspectRatio="none"
              viewBox="0 0 18 24"
              className="absolute inset-0 w-full h-full text-base-300"
            >
              <path d="M 1 0 C 1 12, 17 12, 17 24" stroke="currentColor" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        ) : (
          !(level === 0 && isFirst) && (
            <div 
              className="absolute border-l-2 border-base-300 pointer-events-none"
              style={{ left: currentLeft, top: 0, bottom: '50%', zIndex: 0 }}
            />
          )
        );

        // Bottom Half Line (50% to 100%)
        // Last item at level > 0: curve from child axis back to parent axis (mirrors first item's opening curve)
        // Last item at level 0: no bottom line needed
        // Other items: straight vertical line
        const isLastItem = isLast && !isExpandedFolder;
        let bottomHalf;
        if (isLastItem && level > 0) {
          bottomHalf = (
            <div 
              className="absolute pointer-events-none"
              style={{
                left: parentLeft,
                top: '50%',
                width: 'calc(1rem + 2px)',
                height: '50%',
                zIndex: 0
              }}
            >
              <svg 
                preserveAspectRatio="none"
                viewBox="0 0 18 24"
                className="absolute inset-0 w-full h-full text-base-300"
              >
                <path d="M 17 0 C 17 12, 1 12, 1 24" stroke="currentColor" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          );
        } else if (isLastItem && level === 0) {
          bottomHalf = null;
        } else {
          bottomHalf = (
            <div 
              className="absolute border-l-2 border-base-300 pointer-events-none"
              style={{ left: currentLeft, top: '50%', bottom: 0, zIndex: 0 }}
            />
          );
        }

        return (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            {topHalf}
            {bottomHalf}
            {/* Dot marker at center of item on the line */}
            {level > 0 && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `calc(${currentLeft} + 1px)`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '12px',
                  height: '12px',
                  zIndex: 1
                }}
              >
                <div className={`w-3 h-3 rounded-full flex items-center justify-center transition-colors ${
                  isWatched 
                    ? 'bg-primary group-hover:bg-primary' 
                    : 'bg-base-100 group-hover:bg-base-200'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    isWatched ? 'bg-base-100 group-hover:bg-base-200' : 'bg-base-300'
                  }`} />
                </div>
              </div>
            )}
          </div>
        );

      };

      if (item.type === "folder") {
        const fTotal = countVideos(item.children || []);
        const fWatched = countWatched(item.children || [], watched);
        const fPct = fTotal > 0 ? Math.round((fWatched / fTotal) * 100) : 0;
        
        return (
          <div key={item.path} className="w-full relative">
            <button 
              onClick={() => toggleExpand(item.path)}
              className={`group relative flex items-center gap-3 w-full text-left py-3 pr-4 hover:bg-base-200 transition-colors ${level === 0 ? 'bg-base-200/30' : ''}`}
              style={{ paddingLeft: `${(level + 1) * 1}rem`, zIndex: 1 }}
            >
              {renderSnakeLines()}
              <ChevronRight size={14} className={`transition-transform duration-200 ${isExp ? "rotate-90" : ""} opacity-50 shrink-0 relative z-10 bg-base-100 rounded-full`} />
              <FolderOpen size={16} className="text-primary shrink-0 relative z-10" />
              <div className="flex-1 min-w-0 relative z-10">
                <div className="text-xs font-bold truncate">{item.name}</div>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 shrink-0 relative z-10">
                {fPct}% · {fWatched}/{fTotal}
              </div>
            </button>
            {isExpandedFolder && (
              <div className="flex flex-col relative">
                {renderCurriculum(item.children, level + 1)}
              </div>
            )}
          </div>
        );
      } else if (item.type !== "hidden") {
        const FIcon = FILE_TYPE_ICONS[item.type] || FileIcon;
        const isActive = activeFile?.path === item.path;
        return (
          <button 
            id={`curriculum-item-${item.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
            key={item.path} 
            onClick={() => openFile(item)}
            className={`group relative flex items-center gap-3 w-full text-left py-2.5 pr-4 hover:bg-base-200 transition-colors ${isActive ? 'bg-base-200' : ''}`}
            style={{ paddingLeft: `${(level + 1) * 1 + 1.5}rem`, zIndex: 1 }}
          >
            {renderSnakeLines(!!watched[item.path])}
            <FIcon size={14} className={`${item.type === "video" ? "text-primary" : "opacity-40"} shrink-0 relative z-10 bg-base-100 rounded-full`} />
            <div className={`flex-1 min-w-0 text-xs truncate relative z-10 ${isActive ? 'font-bold' : ''}`}>{item.name}</div>
            {item.type === "video" && (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleWatch(item.path); }}
                className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors relative z-10 ${watched[item.path] ? "bg-primary text-primary-content" : "bg-base-300/50 opacity-20 hover:opacity-50"}`}
              >
                <Check size={12} strokeWidth={3} />
              </button>
            )}
          </button>
        );
      }
      return null;
    });
  };

  const toggleWatch = async (fp: string) => {
    const newVal = !watched[fp];
    setWatched(prev => {
      const next = { ...prev };
      if (newVal) next[fp] = true; else delete next[fp];
      return next;
    });
    try {
      const r = await fetch(`${API}/api/courses/${courseId}/progress`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: fp, watched: newVal }),
      });
      const d = await r.json();
      setWatched(d);
    } catch {}
  };

  const openFile = async (file: any) => {
    // Push file state to URL (replaceState to avoid flooding history)
    history.replaceState({}, '', `/${courseId}?file=${encodeURIComponent(file.path)}`);
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      setActiveFile({ ...file, type: "other" }); setFileContent(null); return;
    }
    if (file.type === "document") {
      window.open(`${API}/api/courses/${courseId}/file?path=${encodeURIComponent(file.path)}`, "_blank");
      return;
    }
    if (file.type === "video" || file.type === "image") {
      setActiveFile(file); setFileContent(null); return;
    }
    if (file.type === "text" || file.type === "code") {
      setActiveFile(file); setViewTab("preview");
      try {
        const r = await fetch(`${API}/api/courses/${courseId}/file?path=${encodeURIComponent(file.path)}`);
        setFileContent(await r.json());
      } catch { setFileContent({ content: "Failed to load file" }); }
      return;
    }
    if (file.type === "link") {
      setActiveFile(file);
      try {
        const r = await fetch(`${API}/api/courses/${courseId}/file?path=${encodeURIComponent(file.path)}`);
        const d = await r.json(); setFileContent(d);
      } catch { setFileContent({ url: "" }); }
      return;
    }
    setActiveFile(file); setFileContent(null);
    // Save last played
    localStorage.setItem(`nest_last_played_${courseId}`, file.path);

    // Auto-expand parent folder of this file and scroll to it
    if (data?.items) {
      const findParentChain = (nodes: any[], targetPath: string, chain: string[] = []): string[] | null => {
        for (const n of nodes) {
          if (n.path === targetPath) return chain;
          if (n.children) {
            const result = findParentChain(n.children, targetPath, [...chain, n.path]);
            if (result) return chain.concat(n.path);
          }
        }
        return null;
      };
      const parentChain = findParentChain(data.items, file.path);
      if (parentChain) {
        setExpanded(p => {
          const next = { ...p };
          parentChain.forEach(pg => { next[pg] = true; });
          return next;
        });
      }
    }

    // Scroll to active file in sidebar after render
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`curriculum-item-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`);
        if (el && sidebarRef.current) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });
  };

  const items = data?.items || [];
  const totalV = data?.items ? countVideos(data.items) : 0;
  const watchedV = data?.items ? countWatched(data.items, watched) : 0;
  const pct = totalV > 0 ? Math.round((watchedV / totalV) * 100) : 0;
  const totalSections = data?.items ? data.items.filter((i: any) => i.type === "folder").length : 0;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDark = useIsDark();
  const gradient = (isDark ? COURSE_GRADIENTS : COURSE_GRADIENTS_LIGHT)[data?.icon] || (isDark ? COURSE_GRADIENTS.BookOpen : COURSE_GRADIENTS_LIGHT.BookOpen);

  return (
    <div className="fixed inset-0 z-[90] bg-base-100 flex flex-col">

      {/* Close Button is inline in sidebar header */}

      {/* ─── INFO + CURRICULUM SPLIT (no file selected) ─── */}
      {!activeFile && data && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

          {/* Left: Course Info Panel */}
          <div className={`w-full md:w-2/5 lg:w-1/3 bg-gradient-to-br ${gradient} flex flex-col md:items-center md:justify-center p-2 md:p-12 relative overflow-hidden border-b md:border-b-0 md:border-r border-base-300/30`}>
            {/* Decorative background glow */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-48 h-48 bg-primary/30 rounded-full blur-[100px]" />
              <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-secondary/20 rounded-full blur-[80px]" />
            </div>
            <div className="relative z-10 flex flex-col md:items-center md:text-center w-full">
              <div className="flex items-center gap-3 md:flex-col md:gap-0 mb-2 md:mb-6">
                <div className="p-1.5 md:p-5 rounded-2xl bg-base-100/20 backdrop-blur-sm border border-white/10">
                  <CourseIcon iconKey={data.icon} size={24} className="text-primary drop-shadow-lg md:w-12 md:h-12" />
                </div>
                <h1 className="text-base md:text-3xl font-black tracking-tight text-white md:mb-2">{data.name}</h1>
              </div>
              {data.subtitle && (
                <p className="text-xs md:text-sm font-medium text-white/80 mb-2 md:mb-8 leading-relaxed hidden md:block">{data.subtitle}</p>
              )}
              {/* Stats Row */}
              <div className="flex items-center gap-4 md:gap-6 mb-2 md:mb-8 text-[9px] md:text-xs font-bold uppercase tracking-widest text-white w-full md:w-auto justify-center">
                <div className="flex flex-col items-center gap-0.5 md:gap-1">
                  <span className="text-sm md:text-lg font-black text-white">{totalSections}</span>
                  <span className="text-white/70">Sections</span>
                </div>
                <div className="w-px h-4 md:h-8 bg-current opacity-30" />
                <div className="flex flex-col items-center gap-0.5 md:gap-1">
                  <span className="text-sm md:text-lg font-black text-white">{totalV}</span>
                  <span className="text-white/70">Videos</span>
                </div>
                <div className="w-px h-4 md:h-8 bg-current opacity-30" />
                <div className="flex flex-col items-center gap-0.5 md:gap-1">
                  <span className="text-sm md:text-lg font-black text-white">{pct}%</span>
                  <span className="text-white/70">Done</span>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full md:max-w-xs">
                <div className="h-1 md:h-2 rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[7px] md:text-[10px] font-bold uppercase tracking-widest text-white/70 mt-1 md:mt-2 text-center md:text-center">
                  {watchedV} of {totalV} videos watched
                </div>
              </div>
            </div>
          </div>

          {/* Right: Curriculum Panel */}
          <div ref={sidebarRef} className="flex-1 flex flex-col overflow-y-auto bg-base-100">
            {/* Sticky Header with hide-on-scroll */}
            <div className="sticky top-0 z-10 bg-base-200/70 backdrop-blur-md">
              <div className="p-3 border-b border-base-300 flex items-center justify-between shadow-sm gap-2">
              <div className="text-[11px] font-black uppercase tracking-widest opacity-70 truncate flex-1" title="Course Curriculum">
                Course Curriculum
              </div>
              <div className="flex items-center gap-3">
                <button onClick={toggleAll} className="btn btn-xs btn-primary bg-primary/20 text-primary hover:bg-primary/30 border-none px-2 h-auto py-1.5 min-h-0 text-[9px] uppercase tracking-widest">
                  {isAnyExpanded ? "Collapse All" : "Expand All"}
                </button>
                <div className="relative w-8 h-8 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-base-300" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary drop-shadow-sm" strokeDasharray="97.4" strokeDashoffset={97.4 - (97.4 * pct) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s ease" }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-primary drop-shadow-sm">{pct}</span>
                </div>
              </div>
            </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader size={20} className="animate-spin text-primary" /></div>
            ) : (
              <div className="flex-1">
                {renderCurriculum(items)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── FILE VIEW (file selected) ─── */}
      {activeFile && (
        <div className="flex-1 flex overflow-hidden relative">

          {/* Sidebar (compact) */}
          <div ref={sidebarRef} className={`hidden md:flex ${sidebarCollapsed ? 'w-0 overflow-hidden border-r-0' : 'w-1/3 lg:w-1/4'} border-r border-base-300 flex-col overflow-y-auto bg-base-100 relative transition-all duration-300`}>
            {/* Sticky Header with hide-on-scroll */}
            <div className="sticky top-0 z-10 bg-base-200/70 backdrop-blur-md">
              <div className="p-3 border-b border-base-300 flex items-center justify-start shadow-sm gap-2">
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="btn btn-circle btn-sm btn-ghost text-primary shrink-0">
                {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
              </button>
              <button onClick={onClose} className="btn btn-circle btn-sm btn-ghost text-primary hover:bg-primary/10 shrink-0">
                <Home size={16} />
              </button>
              <div className="flex items-center gap-3 ml-auto">
                <button onClick={toggleAll} className="btn btn-xs btn-primary bg-primary/20 text-primary hover:bg-primary/30 border-none px-2 h-auto py-1.5 min-h-0 text-[9px] uppercase tracking-widest">
                  {isAnyExpanded ? "Collapse All" : "Expand All"}
                </button>
                <div className="relative w-8 h-8 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-base-300" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary drop-shadow-sm" strokeDasharray="97.4" strokeDashoffset={97.4 - (97.4 * pct) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s ease" }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-primary drop-shadow-sm">{pct}</span>
                </div>
              </div>
            </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader size={20} className="animate-spin text-primary" /></div>
            ) : (
              <div className="flex-1">
                {renderCurriculum(items)}
              </div>
            )}
          </div>

          {/* Expand sidebar button — only when collapsed */}
          <button onClick={() => setSidebarCollapsed(false)}
            className={`hidden md:flex btn btn-circle btn-sm btn-ghost text-primary hover:bg-primary/10 absolute top-3 left-3 z-20 transition-opacity duration-300 ${sidebarCollapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            style={{ transitionDelay: sidebarCollapsed ? '300ms' : '0ms' }}>
            <PanelLeft size={16} />
          </button>



          {/* Home button — only when sidebar collapsed */}
          <button onClick={() => { setSidebarCollapsed(false); onClose(); }}
            className={`hidden md:flex btn btn-circle btn-sm btn-ghost text-primary hover:bg-primary/10 absolute top-3 left-[46px] z-20 transition-opacity duration-300 ${sidebarCollapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            style={{ transitionDelay: sidebarCollapsed ? '300ms' : '0ms' }}>
            <Home size={16} />
          </button>

          {/* File / Video Preview Area */}
          <div className="flex-1 flex flex-col bg-base-300/10 overflow-y-auto">
            {activeFile.type === "video" && (() => {
              const flattenVideos = (nodes: any[]): any[] => {
                let v: any[] = [];
                for (const n of nodes) {
                  if (n.type === "video") v.push(n);
                  if (n.children) v = v.concat(flattenVideos(n.children));
                }
                return v;
              };
              const allVideos = flattenVideos(items);
              const curIdx = allVideos.findIndex((v: any) => v.path === activeFile.path);
              const nextVideo = curIdx >= 0 && curIdx < allVideos.length - 1 ? allVideos[curIdx + 1] : null;

              return (
                <div className="flex flex-col w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
                  <div className="rounded-xl overflow-hidden bg-black border border-base-300">
                    <video
                      src={`${API}/api/courses/${courseId}/file?path=${encodeURIComponent(activeFile.path)}`}
                      controls autoPlay playsInline className="w-full aspect-video"
                      onEnded={() => {
                        if (!watched[activeFile.path]) toggleWatch(activeFile.path);
                        if (nextVideo) { setActiveFile(nextVideo); setFileContent(null); }
                      }}
                    />
                  </div>
                  <div className="mt-4 px-2 flex items-center justify-between">
                    <div className="text-xl font-bold truncate flex-1 mr-4">{activeFile.name}</div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => toggleWatch(activeFile.path)}
                        className={`btn btn-sm gap-1.5 text-[10px] font-bold uppercase tracking-widest ${watched[activeFile.path] ? "btn-primary" : "btn-ghost border border-base-300"}`}>
                        <Check size={12} /> {watched[activeFile.path] ? "Watched" : "Mark Watched"}
                      </button>
                      {nextVideo && (
                        <button onClick={() => {
                          if (!watched[activeFile.path]) toggleWatch(activeFile.path);
                          setActiveFile(nextVideo); setFileContent(null);
                        }} className="btn btn-sm btn-primary gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                          Next <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile-only Curriculum Section */}
                  <div className="md:hidden -mx-4 mt-4 border-t border-base-300">
                    <div className="sticky top-0 z-10 bg-base-200/70 backdrop-blur-md">
                      <div className="p-3 border-b border-base-300 flex items-center justify-between shadow-sm gap-2">
                        <button onClick={onClose} className="btn btn-circle btn-xs btn-ghost text-primary shrink-0">
                          <Home size={18} />
                        </button>
                        <div className="flex items-center gap-3">
                          <button onClick={toggleAll} className="btn btn-xs btn-primary bg-primary/20 text-primary hover:bg-primary/30 border-none px-2 h-auto py-1.5 min-h-0 text-[9px] uppercase tracking-widest">
                            {isAnyExpanded ? "Collapse All" : "Expand All"}
                          </button>
                          <div className="relative w-8 h-8 shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-base-300" />
                              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary drop-shadow-sm" strokeDasharray="97.4" strokeDashoffset={97.4 - (97.4 * pct) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s ease" }} />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-primary drop-shadow-sm">{pct}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {loading ? (
                      <div className="flex items-center justify-center py-8"><Loader size={20} className="animate-spin text-primary" /></div>
                    ) : (
                      <div className="flex-1">
                        {renderCurriculum(items)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {activeFile.type !== "video" && (
              <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="text-xl font-bold truncate">{activeFile.name}</div>
                  <button onClick={() => { setActiveFile(null); setFileContent(null); }} className="btn btn-ghost btn-sm btn-square"><X size={16} /></button>
                </div>
                
                <div className="flex-1 flex flex-col bg-base-100 border border-base-300 rounded-xl overflow-hidden">
                  {activeFile.type === "image" && (
                    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-base-200/30">
                      <img src={`${API}/api/courses/${courseId}/file?path=${encodeURIComponent(activeFile.path)}`} alt={activeFile.name} className="max-w-full max-h-[70vh] object-contain rounded-md" />
                    </div>
                  )}
                  {(activeFile.type === "text" || activeFile.type === "code") && fileContent && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-base-100">
                      {(activeFile.name.toLowerCase().endsWith('.html') || activeFile.name.toLowerCase().endsWith('.csv')) && (
                        <div className="flex border-b border-base-300 bg-base-200/50 p-2 gap-2 shrink-0">
                          <button className={`btn btn-xs ${viewTab === 'preview' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewTab('preview')}>Preview</button>
                          <button className={`btn btn-xs ${viewTab === 'code' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewTab('code')}>Source Code</button>
                        </div>
                      )}
                      {activeFile.name.toLowerCase().endsWith('.html') && viewTab === 'preview' ? (
                        <iframe srcDoc={fileContent.content} className="w-full h-full border-none bg-white flex-1" title={activeFile.name} sandbox="allow-scripts allow-same-origin" />
                      ) : activeFile.name.toLowerCase().endsWith('.csv') && viewTab === 'preview' ? (
                        <div className="flex-1 overflow-auto bg-base-100 p-0 custom-scrollbar">
                          <table className="table table-xs w-full bg-base-100 border-collapse">
                            {(() => {
                              const rows = parseCSV(fileContent.content);
                              if (rows.length === 0) return null;
                              const header = rows[0]; const body = rows.slice(1);
                              return (<>
                                <thead><tr className="bg-base-300 text-base-content">
                                  {header.map((cell, i) => <th key={i} className="border-r border-base-200/50 last:border-r-0 px-4 py-3 sticky top-0 bg-base-300 z-10 whitespace-nowrap font-bold uppercase tracking-wider text-[10px] text-base-content/70">{cell}</th>)}
                                </tr></thead>
                                <tbody>
                                  {body.map((row, i) => <tr key={i} className="hover:bg-base-200/50 transition-colors border-b border-base-200/50 last:border-b-0">
                                    {row.map((cell, j) => <td key={j} className="border-r border-base-200/50 last:border-r-0 px-4 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-xs" title={cell}>{cell}</td>)}
                                  </tr>)}
                                </tbody>
                              </>);
                            })()}
                          </table>
                        </div>
                      ) : (
                        <pre className={`p-6 overflow-auto text-sm leading-relaxed whitespace-pre font-mono flex-1 language-${(() => {
                          const ext = activeFile.name.split('.').pop()?.toLowerCase() || 'clike';
                          const map: any = { js: 'javascript', ts: 'typescript', py: 'python', c: 'c', cpp: 'cpp', h: 'c' };
                          return map[ext] || ext;
                        })()}`}><code>{fileContent.content}</code></pre>
                      )}
                    </div>
                  )}
                  {(activeFile.type === "text" || activeFile.type === "code") && !fileContent && (
                    <div className="flex-1 flex items-center justify-center p-8"><Loader size={20} className="animate-spin text-primary" /></div>
                  )}
                  {activeFile.type === "link" && (
                    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-6 p-12 text-center bg-base-200/30">
                      <div className="p-5 bg-primary/10 rounded-full"><Link size={48} className="text-primary" /></div>
                      {fileContent ? (fileContent.url ? (<>
                        <div className="max-w-md w-full bg-base-100 p-4 rounded-xl break-all text-sm border border-base-300 font-mono text-base-content/70">{fileContent.url}</div>
                        <a href={fileContent.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary px-8 py-3 h-auto text-xs font-bold uppercase tracking-widest gap-2">Go to Webpage <ExternalLink size={16} /></a>
                      </>) : <div className="text-sm font-bold opacity-50">Invalid or empty link</div>) : <Loader size={24} className="animate-spin text-primary" />}
                    </div>
                  )}
                  {activeFile.type === "other" && (
                    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-5 p-12 text-center bg-base-200/30">
                      <FileIcon size={48} className="opacity-20" />
                      <div className="text-xs font-bold uppercase tracking-widest opacity-40">Preview not available</div>
                      <a href={`${API}/api/courses/${courseId}/file?path=${encodeURIComponent(activeFile.path)}`} download={activeFile.name} className="btn btn-primary text-xs font-bold uppercase tracking-widest gap-2"><Download size={14} /> Download File</a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── LOADING STATE ─── */}
      {!data && loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader size={24} className="animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

// ─── AddCourseModal ───
function AddCourseModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [icon, setIcon] = useState("BookOpen");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !localPath.trim()) { setError("Name and path are required"); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(`${API}/api/courses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), localPath: localPath.trim(), icon, subtitle: subtitle.trim() }),
      });
      const d = await r.json();
      if (d.success) { onAdded(); onClose(); }
      else setError(d.error || "Failed to add course");
    } catch { setError("Connection error"); }
    setSaving(false);
  };

  return (
    <div className="modal modal-open z-[100]">
      <div className="modal-box max-w-md bg-base-200 border border-base-300 p-0 shadow-2xl">
        <div className="p-4 border-b border-base-300 flex justify-between items-center">
          <h3 className="font-bold text-sm flex items-center gap-2"><GraduationCap size={16} className="text-primary" /> Add Course</h3>
          <button className="btn btn-ghost btn-xs btn-square" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1.5 block">Course Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. React Masterclass" className="input input-bordered input-sm w-full bg-base-100 text-xs" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1.5 block">Local Path</label>
            <input type="text" value={localPath} onChange={e => setLocalPath(e.target.value)} placeholder="/home/user/courses/react" className="input input-bordered input-sm w-full bg-base-100 text-xs font-mono" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1.5 block">Subtitle (optional)</label>
            <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Full Stack Development" className="input input-bordered input-sm w-full bg-base-100 text-xs" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 block">Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {COURSE_ICON_LIST.map(i => (
                <button key={i.key} onClick={() => setIcon(i.key)} title={i.label}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${icon === i.key ? "border-primary bg-primary/10" : "border-base-300/50 hover:border-base-300 bg-base-100/50"}`}>
                  <CourseIcon iconKey={i.key} size={18} className={icon === i.key ? "text-primary" : "opacity-50"} />
                  <span className="text-[7px] font-bold uppercase tracking-tight opacity-60 leading-none">{i.label}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <div className="text-[10px] text-error font-bold">{error}</div>}
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm w-full gap-2">
            {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Add Course
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [courses, setCourses] = useState<any[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/courses`);
      setCourses(await r.json());
    } catch {}
  }, []);

  // ─── Browser back/forward: sync URL ↔ state ───
  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  // Read initial URL to restore state on load / reload
  useEffect(() => {
    const path = location.pathname.slice(1);
    if (path) setActiveCourseId(path);
  }, []);

  // Listen for back/forward button
  useEffect(() => {
    const onPop = () => {
      const path = location.pathname.slice(1);
      if (!path) {
        setActiveCourseId(null);
        fetchCourses();
      } else {
        setActiveCourseId(path);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fetchCourses]);

  const openCourse = (id: string) => {
    history.pushState({}, '', `/${id}`);
    setActiveCourseId(id);
  };

  const closeCourse = () => {
    history.pushState({}, '', '/');
    setActiveCourseId(null);
    fetchCourses();
  };

  const deleteCourse = async (id: string) => {
    if (!confirm("Remove this course?")) return;
    await fetch(`${API}/api/courses/${id}`, { method: "DELETE" });
    fetchCourses();
  };

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-base-100 border-b border-base-300">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🪺</span>
            <h1 className="text-sm font-bold">Nest</h1>
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-30">v1.0.0</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm gap-1 text-[10px] font-bold uppercase tracking-widest">
              <Plus size={14} /> Add Course
            </button>
          </div>
        </div>
      </div>

      {/* Course Grid */}
      <div className="p-4 max-w-4xl mx-auto">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="text-4xl mb-4">🪺</div>
            <div className="text-sm font-bold mb-2">No courses yet</div>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-6">
              Add a local course folder to get started
            </div>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm gap-2 text-[10px] font-bold uppercase tracking-widest">
              <Plus size={14} /> Add Your First Course
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {courses.map(c => (
              <CourseCard key={c.id} course={c} onClick={() => openCourse(c.id)} onDelete={() => deleteCourse(c.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      {activeCourseId && <CourseDetailOverlay courseId={activeCourseId} onClose={closeCourse} />}
      {showAdd && <AddCourseModal onClose={() => setShowAdd(false)} onAdded={fetchCourses} />}
    </div>
  );
}
