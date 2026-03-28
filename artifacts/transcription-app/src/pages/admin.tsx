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
  Users, Activity, Clock, Plus, RefreshCw, Trash2, Power, PowerOff, ArrowLeft, Star 
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

  if (meLoading || usersLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>;
  if (!me?.isAdmin) return null;

  const users = usersData?.users || [];
  const feedback = feedbackData?.feedback || [];

  const totalMinutes = users.reduce((acc, u) => acc + u.totalMinutesUsed, 0);
  const activeCount = users.filter(u => u.isActive).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMut.mutateAsync({
      data: { username: newUsername, password: newPassword, dailyLimitMinutes: newLimit, isAdmin: newIsAdmin }
    });
    setShowCreate(false);
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
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4 text-muted-foreground hover:text-white -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Workspace
            </Button>
            <h1 className="text-3xl font-display font-bold text-white">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage users, limits, and monitor usage.</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Users</p>
              <p className="text-3xl font-bold mt-1">{users.length}</p>
            </div>
          </Card>
          <Card className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Users</p>
              <p className="text-3xl font-bold mt-1">{activeCount}</p>
            </div>
          </Card>
          <Card className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Mins Transcribed</p>
              <p className="text-3xl font-bold mt-1">{formatMinutes(totalMinutes)}</p>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
          <button 
            onClick={() => setActiveTab("users")}
            className={`text-lg font-medium transition-colors ${activeTab === "users" ? "text-white border-b-2 border-primary pb-4 -mb-[17px]" : "text-muted-foreground hover:text-white/80"}`}
          >
            Users
          </button>
          <button 
            onClick={() => setActiveTab("feedback")}
            className={`text-lg font-medium transition-colors ${activeTab === "feedback" ? "text-white border-b-2 border-primary pb-4 -mb-[17px]" : "text-muted-foreground hover:text-white/80"}`}
          >
            Feedback Responses
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "users" && (
          <Card className="overflow-hidden">
            <div className="p-6 flex items-center justify-between border-b border-white/5 bg-secondary/30">
              <h2 className="text-xl font-semibold">User Management</h2>
              <Button onClick={() => setShowCreate(!showCreate)} size="sm">
                <Plus className="w-4 h-4 mr-2" /> New User
              </Button>
            </div>

            {showCreate && (
              <div className="p-6 bg-secondary/50 border-b border-white/5">
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Username</label>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Password</label>
                    <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Daily Limit (Mins)</label>
                    <Input type="number" value={newLimit} onChange={e => setNewLimit(Number(e.target.value))} required min={1} />
                  </div>
                  <div className="space-y-1 flex items-center h-11 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} className="w-4 h-4 rounded bg-background border-white/20 text-primary focus:ring-primary/20 focus:ring-offset-0" />
                      <span className="text-sm">Is Admin?</span>
                    </label>
                  </div>
                  <Button type="submit" isLoading={createMut.isPending}>Create</Button>
                </form>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/30 text-muted-foreground uppercase text-xs tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Usage Today</th>
                    <th className="px-6 py-4 font-medium">Total Usage</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-white flex items-center gap-2">
                          {u.username} {u.isAdmin && <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-widest">Admin</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Joined {format(new Date(u.createdAt), "MMM d, yyyy")}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-destructive'}`}></span>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary" 
                              style={{ width: `${Math.min(100, (u.minutesUsedToday / u.dailyLimitMinutes) * 100)}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground">{formatMinutes(u.minutesUsedToday)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {formatMinutes(u.totalMinutesUsed)} ({u.totalSessions} sessions)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                        <Button 
                          variant="outline" size="sm" 
                          onClick={() => resetUsage(u.id)}
                          title="Reset Today's Usage"
                        >
                          <RefreshCw className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="outline" size="sm"
                          onClick={() => toggleStatus(u.id, u.isActive)}
                          title={u.isActive ? "Disable User" : "Enable User"}
                        >
                          {u.isActive ? <PowerOff className="w-4 h-4 text-amber-500" /> : <Power className="w-4 h-4 text-green-500" />}
                        </Button>
                        <Button 
                          variant="outline" size="sm"
                          className="hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                          onClick={() => deleteUser(u.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
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
              <Card key={item.id} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-white">{item.username}</h3>
                    <p className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= item.rating ? 'text-accent fill-accent' : 'text-white/10'}`} />
                    ))}
                  </div>
                </div>
                {item.comment ? (
                  <p className="text-sm text-white/80 italic">"{item.comment}"</p>
                ) : (
                  <p className="text-sm text-white/30 italic">No comment provided.</p>
                )}
              </Card>
            ))}
            {feedback.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed border-white/10 rounded-2xl">
                No feedback received yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
