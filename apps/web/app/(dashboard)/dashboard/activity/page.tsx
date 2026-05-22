import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  ImagePlus,
  Lock,
  LogOut,
  Mail,
  Settings,
  ShieldAlert,
  Truck,
  UserCog,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { ActivityType } from '@/lib/db/schema';
import { getActivityLogs } from '@/lib/db/queries';

const iconMap: Record<ActivityType, LucideIcon> = {
  [ActivityType.SIGN_UP]: UserPlus,
  [ActivityType.SIGN_IN]: UserCog,
  [ActivityType.SIGN_OUT]: LogOut,
  [ActivityType.UPDATE_PASSWORD]: Lock,
  [ActivityType.DELETE_ACCOUNT]: UserMinus,
  [ActivityType.UPDATE_ACCOUNT]: Settings,
  [ActivityType.CREATE_WORKSPACE]: UserPlus,
  [ActivityType.REMOVE_WORKSPACE_MEMBER]: UserMinus,
  [ActivityType.INVITE_WORKSPACE_MEMBER]: Mail,
  [ActivityType.ACCEPT_INVITATION]: CheckCircle,
  [ActivityType.CREATE_LISTING_PACK]: ImagePlus,
  [ActivityType.PUBLISH_TO_PLATFORM]: Truck,
  [ActivityType.COMPLIANCE_CHECK]: ShieldAlert,
  [ActivityType.UPDATE_OVERAGE_SETTING]: CreditCard,
};

function getRelativeTime(date: Date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return '刚刚';
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} 分钟前`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} 小时前`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} 天前`;
  return date.toLocaleDateString();
}

function formatAction(action: ActivityType): string {
  switch (action) {
    case ActivityType.SIGN_UP:
      return '注册账号';
    case ActivityType.SIGN_IN:
      return '登录';
    case ActivityType.SIGN_OUT:
      return '退出登录';
    case ActivityType.UPDATE_PASSWORD:
      return '修改密码';
    case ActivityType.DELETE_ACCOUNT:
      return '删除账号';
    case ActivityType.UPDATE_ACCOUNT:
      return '更新账号信息';
    case ActivityType.CREATE_WORKSPACE:
      return '创建工作区';
    case ActivityType.REMOVE_WORKSPACE_MEMBER:
      return '移除工作区成员';
    case ActivityType.INVITE_WORKSPACE_MEMBER:
      return '邀请工作区成员';
    case ActivityType.ACCEPT_INVITATION:
      return '接受邀请';
    case ActivityType.CREATE_LISTING_PACK:
      return '创建上架包';
    case ActivityType.PUBLISH_TO_PLATFORM:
      return '发布到平台';
    case ActivityType.COMPLIANCE_CHECK:
      return '运行合规检查';
    case ActivityType.UPDATE_OVERAGE_SETTING:
      return '更新超额计费设置';
    default:
      return '未知操作';
  }
}

export default async function ActivityPage() {
  const logs = await getActivityLogs();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        活动日志
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>近期活动</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <ul className="space-y-4">
              {logs.map((log) => {
                const Icon = iconMap[log.action as ActivityType] ?? Settings;
                const formattedAction = formatAction(log.action as ActivityType);

                return (
                  <li key={log.id} className="flex items-center space-x-4">
                    <div className="bg-orange-100 rounded-full p-2">
                      <Icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formattedAction}
                        {log.ipAddress && ` · 来自 IP ${log.ipAddress}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {getRelativeTime(new Date(log.timestamp))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <AlertCircle className="h-12 w-12 text-orange-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                还没有活动记录
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                当你执行登录、修改账号等操作时,会在这里看到记录。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
