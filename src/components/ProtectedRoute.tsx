import React, { useState, useEffect } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireEmployee?: boolean;
  requiredRoles?: string[];
  requiredPermissions?: string[];
}

export default function ProtectedRoute({ children, requireEmployee = true, requiredRoles, requiredPermissions }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;
    let localSessionData: any = null;

    const localSessionStr = localStorage.getItem('direct_employee_session');
    if (localSessionStr) {
      try {
        localSessionData = JSON.parse(localSessionStr);
      } catch (e) {
        console.error("Invalid local session", e);
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
          unsubscribeUserDoc = null;
        }
        navigate('/');
        return;
      }

      if (!requireEmployee) {
        setIsAuthorized(true);
        setIsChecking(false);
        return;
      }

      const email = user.email || '';
      const isAnonymous = !email;
      const isInternal = email.endsWith('@restaurant.internal') || email === 'salem.sam59@gmail.com';
      
      let searchDocId = '';
      
      if (isAnonymous) {
        if (localSessionData && localSessionData.uid) {
           searchDocId = localSessionData.uid;
        } else {
           await auth.signOut().catch(e => console.error("Sign out error:", e));
           navigate('/');
           return;
        }
      } else {
        const usernameToSearch = isInternal && email !== 'salem.sam59@gmail.com' ? email.split('@')[0] : email;
        searchDocId = email === 'salem.sam59@gmail.com' ? email : usernameToSearch;
        
        try {
          const docCheck = await getDoc(doc(db, 'users', searchDocId));
          if (!docCheck.exists() && isInternal) {
             searchDocId = email;
          }
        } catch(e) {}
      }

      try {
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
        }

        unsubscribeUserDoc = onSnapshot(doc(db, 'users', searchDocId), async (userDoc) => {
          let roleId = 'customer';
          let permissions: string[] = [];
          let isSystemAdmin = false;
          let isActive = true;
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.status === 'inactive') {
               isActive = false;
            }
            roleId = userData.roleId;
            const userPermissions = userData.permissions;
            
            // Fetch role to get permissions if user doesn't have custom ones
            try {
              if (roleId) {
                const roleDoc = await getDoc(doc(db, 'roles', roleId));
                if (roleDoc.exists()) {
                  permissions = (userPermissions && userPermissions.length > 0) ? userPermissions : (roleDoc.data().permissions || []);
                  isSystemAdmin = roleDoc.data().isSystem && roleId === 'admin';
                } else {
                  // Fallback for default roles if not in DB
                  if (roleId === 'admin') isSystemAdmin = true;
                  if (roleId === 'cashier' || roleId === 'pos') permissions = (userPermissions && userPermissions.length > 0) ? userPermissions : ['pos.access', 'product.availability'];
                  if (roleId === 'chef' || roleId === 'kitchen') permissions = (userPermissions && userPermissions.length > 0) ? userPermissions : ['kitchen.access', 'product.availability'];
                  if (roleId === 'driver') permissions = (userPermissions && userPermissions.length > 0) ? userPermissions : ['driver.access'];
                  if (roleId === 'manager') permissions = (userPermissions && userPermissions.length > 0) ? userPermissions : ['pos.access', 'kitchen.access', 'inventory.view', 'reports.view', 'product.availability'];
                }
              } else {
                permissions = userPermissions || [];
              }
            } catch (e: any) {
              if (e.code !== 'permission-denied') {
                console.error('Error fetching role:', e);
              }
            }
          } else if (!isAnonymous && isInternal) {
            // If internal email but no user doc, they were deleted!
            isActive = false;
          } else if (isAnonymous) {
            isActive = false;
          }

          // Force system admin for the main owner account
          if (email === 'salem.sam59@gmail.com' || searchDocId === 'salem.sam59@gmail.com') {
            roleId = 'admin';
            isSystemAdmin = true;
            isActive = true;
          }

          if (!isActive) {
            await auth.signOut().catch(e => console.error("Sign out error:", e));
            setError('هذا الحساب غير نشط أو تم حذفه. يرجى مراجعة الإدارة.');
            return;
          }

          if (roleId === 'customer' && !isInternal) {
            navigate('/customer');
            return;
          }

          // System admin has all permissions
          if (isSystemAdmin) {
            setIsAuthorized(true);
            setIsChecking(false);
            return;
          }

          let hasAccess = true;

          if (requiredRoles && requiredRoles.length > 0) {
            if (!requiredRoles.includes(roleId)) {
              hasAccess = false;
            }
          }

          if (requiredPermissions && requiredPermissions.length > 0) {
            const hasPermission = requiredPermissions.some(p => permissions.includes(p));
            if (!hasPermission) {
              hasAccess = false;
            } else {
              hasAccess = true; // Override role check if permission matches
            }
          }

          if (!hasAccess) {
            // Redirect to their allowed page based on permissions or role
            if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') navigate('/pos');
            else if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') navigate('/kitchen');
            else if (permissions.includes('driver.access') || roleId === 'driver') navigate('/driver');
            else navigate('/hub');
            return;
          }

          setIsAuthorized(true);
          setIsChecking(false);
        }, (error: any) => {
          if (error.code !== 'permission-denied') {
             console.error('Error checking user access:', error);
          }
          if (error.message?.includes('offline') || error.code === 'unavailable') {
            setError('فشل الاتصال: تأكد من توفر شبكة إنترنت، أو جرب شبكة أخرى. (للدخول بدون إنترنت، يجب تسجيل الدخول مسبقاً لحفظ بياناتك).');
          } else {
            // Permission denied usually means session invalid or deleted (or signout)
            if (isAnonymous) {
               localStorage.removeItem('direct_employee_session');
               try { auth.signOut(); } catch(e) {}
               navigate('/');
            } else {
               navigate('/customer');
            }
          }
          setIsChecking(false);
        });

      } catch (error: any) {
        console.error('Error setting up user listener:', error);
        setIsChecking(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, [navigate, requireEmployee, requiredRoles, requiredPermissions]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-red-500/10 text-red-500 p-6 rounded-xl max-w-md text-center">
          <p className="font-bold mb-2">خطأ في الاتصال</p>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return isAuthorized ? <>{children}</> : null;
}
