import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  useGetMe, 
  useAdminListUsers, 
  useAdminCreateUser, 
  useAdminUpdateUser, 
  useAdminDeleteUser, 
  useAdminResetUsage,
  useAdminListFeedback,
  getAdminListUsersQueryKey,
  getAdminListFeedbackQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Users, Activity, Clock, Plus, RefreshCw, Trash2, Power, PowerOff, ArrowLeft, Star, LayoutDashboard
} from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui-components";
import { formatMinutes } from "@/lib/utils";

export default function Admin() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false } });
  
  const { data: usersData, isLoading: usersLoading } = useAdminListUsers({ query: { enabled: !!me?.isAdmin } });
  const { data: feedbackData } = useAdminListFeedback({ query: { enabled: !!me?.isAdmin } });
  
  const createMut = useAdminCreateUser();
  const updateMut = useAdminUpdateUser();
  const deleteMut = useAdminDeleteUser();
  const resetMut = useAdminResetUsage();

  const [activeTab, setActiveTab] = useState<"users" | "feedback">("users");
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLimit, setNewLimit] = useState(180);
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  useEffect(() => {
    if (!meLoading && !me?.isAdmin) {
      setLocation("/");
    }
  }, [me, meLoading, setLocation]);

  if (meLoading || usersLoading) return <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>;
  if (!me?.isAdmin) return null;

  const users = usersData?.users || [];
  const feedback = feedbackData?.feedback || [];

  const totalMinutes = users.reduce((acc, u) => acc + u.totalMinutesUsed, 0);
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeCount = users.filter(u => {
    const a = (u as any).lastActivityAt;
    return a && new Date(a).getTime() > fiveMinAgo;
  }).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMut.mutateAsync({
      data: { username: newUsername, password: newPassword, dailyLimitMinutes: newLimit, isAdmin: newIsAdmin }
    });
    setShowCreate(false);
    setNewUsername("");
    setNewPassword("");
    setNewLimit(180);
    setNewIsAdmin(false);
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
  };

  const toggleStatus = async (id: number, currentStatus: boolean) => {
    await updateMut.mutateAsync({ userId: id, data: { isActive: !currentStatus } });
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
  };

  const resetUsage = async (id: number) => {
    if (confirm("Reset today's usage for this user?")) {
      await resetMut.mutateAsync({ userId: id });
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    }
  };

  const deleteUser = async (id: number) => {
    if (confirm("Are you sure you want to permanently delete this user?")) {
      await deleteMut.mutateAsync({ userId: id });
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6 lg:p-10 text-foreground">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="w-fit text-muted-foreground hover:text-foreground -ml-2 mb-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Workspace
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-semibold tracking-tight">Admin Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Manage users, limits, and monitor usage.</p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 flex items-center gap-4 border-none shadow-sm">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/10">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Users</p>
              <p className="text-2xl font-bold mt-1 font-display">{users.length}</p>
            </div>
          </Card>
          <Card className="p-6 flex items-center gap-4 border-none shadow-sm">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/10">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Users</p>
              <p className="text-2xl font-bold mt-1 font-display">{activeCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">last 5 minutes</p>
            </div>
          </Card>
          <Card className="p-6 flex items-center gap-4 border-none shadow-sm">
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center border border-green-500/10">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Mins Transcribed</p>
              <p className="text-2xl font-bold mt-1 font-display">{formatMinutes(totalMinutes)}</p>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-border pb-px">
          <button 
            onClick={() => setActiveTab("users")}
            className={`text-sm font-medium transition-colors pb-3 border-b-2 ${activeTab === "users" ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            Users Management
          </button>
          <button 
            onClick={() => setActiveTab("feedback")}
            className={`text-sm font-medium transition-colors pb-3 border-b-2 ${activeTab === "feedback" ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            Feedback Responses
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "users" && (
          <Card className="overflow-hidden border-border shadow-sm">
            <div className="p-5 flex items-center justify-between border-b border-border bg-white">
              <h2 className="text-lg font-semibold font-display tracking-tight">Users</h2>
              <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="h-9 shadow-sm">
                <Plus className="w-4 h-4 mr-1.5" /> New User
              </Button>
            </div>

            {showCreate && (
              <div className="p-6 bg-gray-50 border-b border-border">
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="h-10 bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="h-10 bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Daily Limit (Mins)</label>
                    <Input type="number" value={newLimit} onChange={e => setNewLimit(Number(e.target.value))} required min={1} className="h-10 bg-white" />
                  </div>
                  <div className="space-y-1.5 flex items-center h-10 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                      <span className="text-sm font-medium text-foreground">Is Admin?</span>
                    </label>
                  </div>
                  <Button type="submit" isLoading={createMut.isPending} className="h-10">Create Account</Button>
                </form>
              </div>
            )}

            <div className="overflow-x-auto bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50/50 text-muted-foreground uppercase text-[11px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">User</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Usage Today</th>
                    <th className="px-6 py-4 font-semibold">Total Usage</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          {u.username} {u.isAdmin && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">Admin</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Joined {format(new Date(u.createdAt), "MMM d, yyyy")}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                            <div 
                              className="h-full bg-primary" 
                              style={{ width: `${Math.min(100, (u.minutesUsedToday / u.dailyLimitMinutes) * 100)}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground text-xs font-medium">{formatMinutes(u.minutesUsedToday)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs font-medium">
                        {formatMinutes(u.totalMinutesUsed)} <span className="text-gray-400 font-normal">({u.totalSessions} sessions)</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                        <Button 
                          variant="outline" size="sm" 
                          onClick={() => resetUsage(u.id)}
                          title="Reset Today's Usage"
                          className="h-8 w-8 p-0"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="outline" size="sm"
                          onClick={() => toggleStatus(u.id, u.isActive)}
                          title={u.isActive ? "Disable User" : "Enable User"}
                          className="h-8 w-8 p-0"
                        >
                          {u.isActive ? <PowerOff className="w-3.5 h-3.5 text-amber-500" /> : <Power className="w-3.5 h-3.5 text-green-500" />}
                        </Button>
                        <Button 
                          variant="outline" size="sm"
                          className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive text-destructive/70"
                          onClick={() => deleteUser(u.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground bg-white">
                        No users found. Create one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "feedback" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {feedback.map(item => (
              <Card key={item.id} className="p-6 border-none shadow-sm bg-white">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{item.username}</h3>
                    <p className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= item.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                </div>
                {item.comment ? (
                  <p className="text-sm text-foreground/80 italic">"{item.comment}"</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No comment provided.</p>
                )}
              </Card>
            ))}
            {feedback.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground border border-dashed border-border rounded-2xl bg-white">
                No feedback received yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
