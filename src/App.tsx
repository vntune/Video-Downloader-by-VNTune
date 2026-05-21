import React, { useState, useMemo } from 'react';
import { 
  Search, Folder, Download, Filter, FileVideo, 
  ArrowUpIcon, ArrowDownIcon, CheckSquare, Square, 
  FolderOpen, MonitorPlay, Eye, ThumbsUp, ThumbsDown, 
  Share2, Calendar, HardDrive, CheckCircle2, AlertCircle, X
} from 'lucide-react';

interface Video {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  views: number;
  likes: number;
  dislikes: number;
  shares: number;
  uploadDate: string;
  duration: number;
  selected: boolean;
  status: 'idle' | 'downloading' | 'success' | 'error';
  progress: number;
}

export default function App() {
  // 1. & 2. Khung nhập link và Trạng thái quét
  const [inputUrl, setInputUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  // 5. Phần lọc video
  const [filterMinViews, setFilterMinViews] = useState<string>('');
  const [filterMinLikes, setFilterMinLikes] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // 6. Phần sắp xếp video
  const [sortField, setSortField] = useState<'uploadDate' | 'views' | 'likes' | 'title'>('uploadDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 7. & 8. Cài đặt tải xuống
  const [saveFolder, setSaveFolder] = useState('/Users/macbook/Downloads/Videos');
  const [resolution, setResolution] = useState('best');

  // Sinh dữ liệu giả lập
  const generateMockVideos = (count: number, startIndex: number): Video[] => {
    return Array.from({length: count}).map((_, i) => {
      const index = startIndex + i;
      const id = Math.random().toString(36).substring(2, 10);
      const daysAgo = Math.floor(index / 10); // Sortable by index
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      
      const titles = [
        "Hướng Dẫn Lập Trình SwiftUI Cho Người Mới Bắt Đầu - MacOS Development",
        "Cách Cấu Hình App Sandbox Để Publish Lên Mac App Store Chi Tiết Vô Cùng Hiệu Quả",
        "Bóc Tách Dữ Liệu Regex Trên Swift 5.7 Rất Tuyệt Vời - Series Core",
        "Khái Niệm Async/Await & MainActor Trong Swift Concurrency Là Gì?",
        "React Vite Tailwind CSS - Xây dựng giao diện Desktop App Tuyệt Đẹp (Phần 1: Overview)"
      ];

      return {
        id,
        url: `https://youtube.com/watch?v=${id}`,
        title: titles[index % titles.length] + ` [Part ${index + 1}] | 2026 Edition | Full HD`,
        thumbnail: `https://picsum.photos/seed/${id}/320/180`,
        views: Math.max(100, Math.floor(Math.random() * 2000000 - index * 10000)),
        likes: Math.max(10, Math.floor(Math.random() * 50000 - index * 200)),
        dislikes: Math.max(0, Math.floor(Math.random() * 1000)),
        shares: Math.max(0, Math.floor(Math.random() * 5000 - index * 10)),
        uploadDate: date.toISOString().split('T')[0],
        duration: Math.floor(Math.random() * 1200) + 120,
        selected: true,
        status: 'idle',
        progress: 0,
      };
    });
  };

  // Mock hàm lấy dữ liệu
  const handleScan = async () => {
    if (!inputUrl.trim()) return;
    setIsScanning(true);
    
    // Giả lập delay mạng
    await new Promise(res => setTimeout(res, 1200));
    
    // Giả lập trả về danh sách video
    const isChannel = inputUrl.includes('channel') || inputUrl.includes('playlist') || inputUrl.includes('user') || inputUrl.includes('tiktok') || inputUrl.includes('facebook') || inputUrl.includes('@');
    const count = isChannel ? 50 : 1;
    
    const mockVideos = generateMockVideos(count, 0);

    setVideos(mockVideos);
    setLoadedCount(count);
    setHasMore(isChannel); // Assume channel has more videos
    setIsScanning(false);
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    await new Promise(res => setTimeout(res, 1000));
    
    const nextVideos = generateMockVideos(50, loadedCount);
    setVideos(prev => [...prev, ...nextVideos]);
    setLoadedCount(prev => prev + 50);
    
    // Giới hạn giả định có tối đa khoảng 1000 video trên kênh để ẩn nút load more
    if (loadedCount + 50 >= 1000) {
      setHasMore(false);
    }
    setIsLoadingMore(false);
  };

  // Logic Lọc và Sắp xếp
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (filterMinViews && v.views < parseInt(filterMinViews)) return false;
      if (filterMinLikes && v.likes < parseInt(filterMinLikes)) return false;
      if (filterDateFrom && new Date(v.uploadDate) < new Date(filterDateFrom)) return false;
      if (filterDateTo && new Date(v.uploadDate) > new Date(filterDateTo)) return false;
      return true;
    }).sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];
      
      if (sortField === 'uploadDate') {
        aVal = new Date(a.uploadDate).getTime();
        bVal = new Date(b.uploadDate).getTime();
      }

      if (sortField === 'title') {
         aVal = a.title.toLowerCase();
         bVal = b.title.toLowerCase();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [videos, filterMinViews, filterMinLikes, filterDateFrom, filterDateTo, sortField, sortDirection]);

  // Logic Chọn / Bỏ chọn video
  const handleToggleSelectAll = () => {
    const allSelected = filteredVideos.every(v => v.selected);
    const updated = videos.map(v => {
      if (filteredVideos.find(fv => fv.id === v.id)) {
        return { ...v, selected: !allSelected };
      }
      return v;
    });
    setVideos(updated);
  };

  const handleToggleSelect = (id: string) => {
    setVideos(videos.map(v => v.id === id ? { ...v, selected: !v.selected } : v));
  };

  const handleSort = (field: 'uploadDate' | 'views' | 'likes' | 'title') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // 10. Hàm chuẩn hóa tên file trên macOS
  const sanitizeMacFilename = (title: string): string => {
    let cleaned = title.replace(/[:/\0]/g, '-');
    return cleaned.substring(0, 200).trim();
  };

  // 9. Logic Tải xuống & Cập nhật tiến trình
  const handleDownloadSelected = () => {
    const toDownload = filteredVideos.filter(v => v.selected && (v.status === 'idle' || v.status === 'error'));
    if (toDownload.length === 0) return;

    // Đánh dấu các video đã chọn chuyển sang trạng thái downloading
    const toDownloadIds = toDownload.map(v => v.id);
    setVideos(prev => prev.map(v => 
      toDownloadIds.includes(v.id) ? { ...v, status: 'downloading', progress: 0 } : v
    ));

    // Thực thi giả lập tuần tự hoặc song song (ở đây giả lập song song)
    toDownloadIds.forEach(id => {
      simulateDownload(id);
    });
  };

  const simulateDownload = async (id: string) => {
    let progress = 0;
    while (progress < 100) {
      await new Promise(res => setTimeout(res, 200 + Math.random() * 400));
      progress += Math.floor(Math.random() * 12) + 2;
      if (progress > 100) progress = 100;
      
      setVideos(prev => prev.map(v => v.id === id ? { ...v, progress } : v));
    }
    
    setVideos(prev => prev.map(v => v.id === id ? { ...v, status: 'success' } : v));
  };

  const removeVideo = (id: string) => {
    setVideos(videos.filter(v => v.id !== id));
  };

  // Định dạng hiển thị số
  const formatNumber = (num: number) => new Intl.NumberFormat('vi-VN').format(num);

  const activeDownloads = videos.filter(v => v.status === 'downloading' || v.status === 'success' || v.status === 'error');

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      
      {/* KHU VỰC LÀM VIỆC CHÍNH */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800">
        
        {/* Header Bar */}
        <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center px-4 shrink-0">
          <div className="flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-blue-500" />
            <h1 className="font-semibold text-slate-100 uppercase tracking-wide text-sm">Video Dowloader by VNTune.com</h1>
          </div>
        </header>

        {/* 1. & 2. Khung nhập link */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder="Dán link Video đơn lẻ hoặc link Kênh (Channel/Playlist) vào đây..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm 
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <button 
              onClick={handleScan}
              disabled={isScanning || !inputUrl.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 
                         text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              {isScanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang quét...
                </>
              ) : (
                'OK - Quét Link'
              )}
            </button>
          </div>
        </div>

        {/* 5. Bộ lọc video */}
        <div className="flex flex-wrap items-center gap-4 bg-slate-800/40 px-4 py-2.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-slate-300">Bộ lọc:</span>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Từ</span>
            <input 
              type="number" 
              value={filterMinViews}
              onChange={(e) => setFilterMinViews(e.target.value)}
              placeholder="0 view" 
              className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <ThumbsUp className="w-3.5 h-3.5 text-slate-400" />
             <span className="text-xs text-slate-400">Từ</span>
            <input 
              type="number" 
              value={filterMinLikes}
              onChange={(e) => setFilterMinLikes(e.target.value)}
              placeholder="0 like" 
              className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="h-4 w-px bg-slate-700 mx-2"></div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Mới hơn</span>
            <input 
              type="date" 
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none [color-scheme:dark]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Đến</span>
            <input 
              type="date" 
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none [color-scheme:dark]"
            />
          </div>
        </div>

        {/* 3. Phân vùng danh sách video được bóc tách */}
        <div className="flex-1 overflow-auto bg-slate-900/50">
          <table className="w-full min-w-[900px] border-collapse relative">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10 border-b border-slate-800 shadow-sm">
              <tr>
                {/* Checkbox Tất cả */}
                <th className="px-4 py-3 text-left w-12">
                  <button onClick={handleToggleSelectAll} className="text-slate-400 hover:text-blue-500 transition-colors">
                    {filteredVideos.length > 0 && filteredVideos.every(v => v.selected) ? (
                      <CheckSquare className="w-5 h-5 text-blue-500" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest w-24">Thumb</th>
                
                {/* Các cột có chức năng Sắp xếp (6.) */}
                {[
                  { id: 'title', label: 'Tên Video', icon: FileVideo, align: 'left' },
                  { id: 'uploadDate', label: 'Ngày Đăng', icon: Calendar, align: 'left' },
                  { id: 'views', label: 'Lượt Xem', icon: Eye, align: 'right' },
                  { id: 'likes', label: 'Likes', icon: ThumbsUp, align: 'right' },
                  { id: 'dislikes', label: 'Dislikes', icon: ThumbsDown, align: 'right' },
                  { id: 'shares', label: 'Chia Sẻ', icon: Share2, align: 'right' },
                ].map((col) => (
                  <th 
                    key={col.id}
                    onClick={() => handleSort(col.id as any)}
                    className={`px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800 transition-colors group select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {col.icon && <col.icon className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />}
                      {col.label}
                      <div className="w-3.5 flex justify-center">
                        {sortField === col.id ? (
                          sortDirection === 'asc' ? <ArrowUpIcon className="w-3 h-3 text-blue-400" /> : <ArrowDownIcon className="w-3 h-3 text-blue-400" />
                        ) : null}
                      </div>
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-16">Bỏ</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-800/60">
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500 space-y-3">
                      <FolderOpen className="w-10 h-10 opacity-40" />
                      <p>Không có video nào trong danh sách. Hãy nhấn "Quét Link" để lấy dữ liệu.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVideos.map((video) => (
                  <tr 
                    key={video.id} 
                    className={`hover:bg-slate-800/40 transition-colors group ${video.selected ? 'bg-blue-900/10' : ''}`}
                  >
                    {/* Checkbox cá nhân (4.) */}
                    <td className="px-4 py-3">
                      <button 
                        onClick={() => handleToggleSelect(video.id)} 
                        className="text-slate-500 hover:text-blue-500 transition-colors"
                      >
                        {video.selected ? <CheckSquare className="w-5 h-5 text-blue-500" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-20 h-12 rounded bg-slate-800 overflow-hidden relative shadow min-w-[80px]">
                        <img src={video.thumbnail} alt="thumb" className="w-full h-full object-cover" />
                        <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[9px] font-mono font-medium text-white">
                          {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-200">
                      <div className="line-clamp-2 leading-snug" title={video.title}>{video.title}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-1 w-full truncate max-w-sm">File: {sanitizeMacFilename(video.title)}.mp4</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{video.uploadDate}</td>
                    <td className="px-4 py-3 text-xs text-slate-300 text-right font-medium">{formatNumber(video.views)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-right">{formatNumber(video.likes)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-right">{formatNumber(video.dislikes)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-right">{formatNumber(video.shares)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => removeVideo(video.id)} className="text-red-400/50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <X className="w-4 h-4 mx-auto" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {hasMore && filteredVideos.length > 0 && (
            <div className="p-6 flex justify-center">
              <button 
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-8 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-sm font-medium transition-colors border border-slate-700 flex items-center gap-2 shadow-lg"
              >
                {isLoadingMore ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                    Đang tải thêm...
                  </>
                ) : (
                  'Tải thêm 50 video tiếp theo'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL */}
      <div className="w-[360px] bg-slate-900 flex flex-col shrink-0 flex-none z-20 shadow-2xl">
        
        {/* Output Settings Area */}
        <div className="p-5 border-b border-slate-800 space-y-5 shadow-sm relative">
          <h2 className="text-sm border-b border-slate-800 pb-2 font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-400" />
            Cấu hình lưu trữ
          </h2>
          
          {/* 7. Chọn thư mục */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Thư mục đầu ra</label>
            <div className="flex gap-2 relative group">
              <input 
                type="text" 
                value={saveFolder}
                onChange={(e) => setSaveFolder(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono 
                           text-slate-300 focus:border-blue-500 focus:outline-none pr-10"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <FolderOpen className="w-4 h-4 text-slate-500 group-hover:text-blue-400 cursor-pointer transition-colors" />
              </div>
            </div>
          </div>

          {/* 8. Chọn độ phân giải */}
          <div className="space-y-2">
             <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Chất lượng Video</label>
             <div className="relative">
               <select 
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full appearance-none bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 
                             focus:border-blue-500 focus:outline-none cursor-pointer"
               >
                 <option value="best">Tự động Cao Nhất / Best</option>
                 <option value="4k">4K (2160p)</option>
                 <option value="2k">2K (1440p)</option>
                 <option value="1080">Full HD (1080p)</option>
                 <option value="720">HD (720p)</option>
               </select>
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                 <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
               </div>
             </div>
          </div>

          <button 
            onClick={handleDownloadSelected}
            disabled={filteredVideos.filter(v => v.selected).length === 0}
            className="w-full mt-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500
                       disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed
                       text-white rounded-lg font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Tải xuống {filteredVideos.filter(v => v.selected && (v.status === 'idle' || v.status === 'error')).length} Mục Đã Chọn
          </button>
        </div>

        {/* 9. Hiển thị tiến trình tải */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/40">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
            <h3 className="text-[13px] font-bold text-slate-200 uppercase tracking-wide">Trình Quản Lý Tải Xuống</h3>
            <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
              {activeDownloads.filter(v => v.status === 'downloading').length} Đang chạy
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
             {activeDownloads.length === 0 ? (
                <div className="text-center text-slate-600 text-xs mt-10">
                  <Download className="w-8 h-8 opacity-20 mx-auto mb-2" />
                  Chưa có tiến trình tải nào.
                </div>
             ) : (
                activeDownloads.map((task) => (
                  <div key={task.id} className="bg-slate-900 p-3 rounded-lg border border-slate-800/80 shadow-sm">
                    <div className="flex gap-3">
                      <div className="w-12 h-12 rounded bg-slate-800 shrink-0 overflow-hidden shadow-sm">
                         <img src={task.thumbnail} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div className="text-[11px] font-semibold text-slate-200 truncate" title={task.title}>
                          {task.title}
                        </div>
                        {/* 10. Tên file lưu trữ thực tế trên macOS */}
                        <div className="text-[9px] text-slate-500 font-mono truncate" title={sanitizeMacFilename(task.title)}>
                          Save as: {sanitizeMacFilename(task.title)}.mp4
                        </div>
                        
                        {/* Progress Bar & Status */}
                        <div className="mt-1.5 flex items-center gap-2">
                          {task.status === 'downloading' ? (
                            <>
                              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                  style={{ width: `${task.progress}%` }}
                                ></div>
                              </div>
                              <span className="text-[10px] font-mono font-medium text-blue-400 w-8 text-right">{task.progress}%</span>
                            </>
                          ) : task.status === 'success' ? (
                            <div className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium">
                              <AlertCircle className="w-3.5 h-3.5" /> Gặp lỗi
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
             )}
          </div>
        </div>
      </div>

    </div>
  );
}

