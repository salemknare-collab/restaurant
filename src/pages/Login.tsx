import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ArrowLeft, UtensilsCrossed, Mail, Lock, LogIn, Store } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSettings } from '../context/SettingsContext';
import { generateInternalEmail } from '../lib/firestoreUtils';

export default function Login() {
  const navigate = useNavigate();
  const { invoiceSettings, storeSettings } = useSettings();
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true); // Start loading while checking auth
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const normalizedEmail = user.email || '';
        
        if (!normalizedEmail) {
           // Anonymous user session
           const directSession = localStorage.getItem('direct_employee_session');
           if (directSession) {
             try {
               const session = JSON.parse(directSession);
               const { roleId, permissions } = session;
               const hasAdminPerms = (permissions || []).some((p: string) => ['inventory.view', 'inventory.edit', 'reports.view', 'settings.access', 'users.manage'].includes(p));
               
               let moduleCount = 0;
               if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') moduleCount++;
               if (permissions?.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') moduleCount++;
               if (permissions?.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') moduleCount++;
               if (permissions?.includes('driver.access') || roleId === 'driver') moduleCount++;

               if (moduleCount > 1) {
                 navigate('/hub');
               } else if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') {
                 navigate('/admin');
               } else if (permissions?.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') {
                 navigate('/pos');
               } else if (permissions?.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') {
                 navigate('/kitchen');
               } else if (permissions?.includes('driver.access') || roleId === 'driver') {
                 navigate('/driver');
               } else {
                 navigate('/hub');
               }
               return;
             } catch (e) {
                localStorage.removeItem('direct_employee_session');
                setIsLoading(false);
                return;
             }
           } else {
             // Anonymous user session without a direct_employee_session
             setIsLoading(false);
             return;
           }
        }

        if (normalizedEmail === 'salem.sam59@gmail.com') {
          navigate('/admin');
          return;
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', normalizedEmail));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();

            if (userData.name && user.displayName !== userData.name) {
              import('firebase/auth').then(({ updateProfile }) => {
                updateProfile(user, { displayName: userData.name }).catch(e => console.error("Error updating profile", e));
              }).catch(e => console.error("Error loading auth module", e));
            }

            const roleId = userData.roleId;
            const userPermissions = userData.permissions;
            
            let permissions: string[] = [];
            if (userPermissions && userPermissions.length > 0) {
              permissions = userPermissions;
            } else if (roleId) {
              try {
                const roleDoc = await getDoc(doc(db, 'roles', roleId));
                if (roleDoc.exists()) {
                  permissions = roleDoc.data().permissions || [];
                } else {
                  if (roleId === 'cashier' || roleId === 'pos') permissions = ['pos.access', 'product.availability'];
                  if (roleId === 'chef' || roleId === 'kitchen') permissions = ['kitchen.access', 'product.availability'];
                  if (roleId === 'driver') permissions = ['driver.access'];
                }
              } catch (e) {
                console.error('Error fetching role permissions:', e);
              }
            }
            
            const hasAdminPerms = permissions.some(p => ['inventory.view', 'inventory.edit', 'reports.view', 'settings.access', 'users.manage'].includes(p));
            
            let moduleCount = 0;
            if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') moduleCount++;
            if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') moduleCount++;
            if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') moduleCount++;
            if (permissions.includes('driver.access') || roleId === 'driver') moduleCount++;

            if (moduleCount > 1) {
              navigate('/hub');
            } else if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') {
              navigate('/admin');
            } else if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') {
              navigate('/pos');
            } else if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') {
              navigate('/kitchen');
            } else if (permissions.includes('driver.access') || roleId === 'driver') {
              navigate('/driver');
            } else {
              navigate('/hub');
            }
          } else {
            // If no user doc but internal email, default to admin
            if (normalizedEmail.endsWith('@restaurant.internal')) {
              navigate('/admin');
            } else {
              navigate('/customer');
            }
          }
        } catch (roleError: any) {
          console.error('Error fetching user role:', roleError);
          if (roleError.message?.includes('offline') || roleError.code === 'unavailable') {
            setError('فشل الاتصال: تأكد من توفر شبكة إنترنت، أو جرب شبكة أخرى. (للدخول بدون إنترنت، يجب تسجيل الدخول مسبقاً لحفظ بياناتك).');
            setIsLoading(false);
            return;
          }
          navigate('/customer');
        }
      } else {
        setIsLoading(false); // Stop loading if not authenticated
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleResetPassword = async () => {
    if (!username) {
      setError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني أولاً لإرسال رابط استعادة كلمة المرور');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      const emailToReset = username.includes('@') ? username : generateInternalEmail(username);
      await sendPasswordResetEmail(auth, emailToReset);
      setResetSent(true);
      setError('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('لا يوجد حساب مرتبط بهذا البريد الإلكتروني.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('تم تجاوز الحد الأقصى لمحاولات استعادة كلمة المرور. يرجى المحاولة لاحقاً.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('فشل الاتصال: تأكد من توفر شبكة إنترنت، أو جرب شبكة أخرى. (للدخول بدون إنترنت، يجب تسجيل الدخول مسبقاً لحفظ بياناتك).');
      } else {
        setError('حدث خطأ أثناء إرسال رابط استعادة كلمة المرور.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setIsLoading(true);
    setError('');

    const cleanUsername = username.trim();
    const isSalem = cleanUsername.toLowerCase() === 'salem.sam59@gmail.com';
    const isInternalUser = !cleanUsername.includes('@') || cleanUsername.endsWith('@restaurant.internal');
    
    // Check local document securely using Anonymous Auth and Server-Side validation (Only for internal employee accounts)
    if (isInternalUser && !isSalem) {
      try {
        const { doc, getDoc, setDoc } = await import('firebase/firestore');
        const { signInAnonymously } = await import('firebase/auth');
        const { db, auth } = await import('../firebase');
        
        let authenticatedViaDb = false;
        let userData: any = null;

        try {
          // 1. Sign in anonymously to get a server-side UID context
          const anonCred = await signInAnonymously(auth);
          
          // 2. Attempt to bind the session by passing username and password to Firestore Rules
          // If the password matches the one stored in `users/{username}`, the rule allows the write!
          await setDoc(doc(db, 'sessions', anonCred.user.uid), {
             username: username,
             password: password
          });

          // 3. If we get here, the rule allowed the write, which mathematically proves the password was correct!
          // Now, because we have a valid session document, `isEmployee()` evaluates to TRUE, so we can securely fetch our own data.
          let directDoc = await getDoc(doc(db, 'users', username));
          
          if (!directDoc.exists()) {
             // fallback to checking older accounts that used generated email as their ID 
             directDoc = await getDoc(doc(db, 'users', generateInternalEmail(username)));
          }

          if (directDoc.exists()) {
             authenticatedViaDb = true;
             userData = directDoc.data();
          }

        } catch (bindError: any) {
          // A permission-denied here means the password was incorrect!
          if (bindError.code === 'permission-denied') {
            // Fall through to traditional check or just handle it
          } else if (bindError.code === 'auth/network-request-failed' || bindError.code === 'unavailable') {
            setError('فشل الاتصال: تأكد من توفر شبكة إنترنت، أو جرب شبكة أخرى. (للدخول بدون إنترنت، يجب تسجيل الدخول مسبقاً لحفظ بياناتك).');
            setIsLoading(false);
            return;
          }
        }

        if (authenticatedViaDb) {
          if (userData.status === 'inactive') {
            setError('هذا الحساب غير نشط. يرجى مراجعة الإدارة.');
            setIsLoading(false);
            return;
          }

          // Setup permissions based on roles if navigating authenticated users
          const roleId = userData.roleId;
          const userPermissions = userData.permissions;
          
          let permissions: string[] = [];
          if (userPermissions && userPermissions.length > 0) {
            permissions = userPermissions;
          } else if (roleId) {
            try {
              const roleDoc = await getDoc(doc(db, 'roles', roleId));
              if (roleDoc.exists()) {
                permissions = roleDoc.data().permissions || [];
              } else {
                if (roleId === 'cashier' || roleId === 'pos') permissions = ['pos.access', 'product.availability'];
                if (roleId === 'chef' || roleId === 'kitchen') permissions = ['kitchen.access', 'product.availability'];
                if (roleId === 'driver') permissions = ['driver.access'];
              }
            } catch (e) {
              console.error('Error fetching role permissions:', e);
            }
          }

          // Store user data in localStorage to simulate an authenticated session
          // This is a requirement for the app expecting an auth user context
          localStorage.setItem('direct_employee_session', JSON.stringify({
            uid: username,
            email: `${username}@local`,
            displayName: userData.name || username,
            roleId,
            permissions
          }));

          const hasAdminPerms = permissions.some(p => ['inventory.view', 'inventory.edit', 'reports.view', 'settings.access', 'users.manage'].includes(p));
          
          let moduleCount = 0;
          if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') moduleCount++;
          if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') moduleCount++;
          if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') moduleCount++;
          if (permissions.includes('driver.access') || roleId === 'driver') moduleCount++;

          if (moduleCount > 1) {
            navigate('/hub');
          } else if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') {
            navigate('/admin');
          } else if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') {
            navigate('/pos');
          } else if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') {
            navigate('/kitchen');
          } else if (permissions.includes('driver.access') || roleId === 'driver') {
            navigate('/driver');
          } else {
            navigate('/hub');
          }
          return;
        }
      } catch (dbError) {
        console.error('Error checking user credentials directly:', dbError);
      }
    }
    
    // Fallback exactly to traditional firebase auth just in case (e.g. salem or customer endpoints)
    const normalizedEmail = username.includes('@') 
      ? username.toLowerCase().trim() 
      : generateInternalEmail(username);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      
      // Use the actual email from Firebase Auth to preserve case
      const actualEmail = userCredential.user.email || normalizedEmail;
      
      // Check user role and redirect
      if (actualEmail === 'salem.sam59@gmail.com') {
        navigate('/admin');
        return;
      }

      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const userDoc = await getDoc(doc(db, 'users', actualEmail));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // Fix anonymous or missing display name for employees
          if (userData.name && userCredential.user.displayName !== userData.name) {
            try {
              const { updateProfile } = await import('firebase/auth');
              await updateProfile(userCredential.user, { displayName: userData.name });
            } catch (profileError) {
              console.error('Error updating profile name:', profileError);
            }
          }

          if (userData.status === 'inactive' && actualEmail !== 'salem.sam59@gmail.com') {
            await auth.signOut().catch(e => console.error("Sign out error:", e));
            setError('هذا الحساب غير نشط. يرجى مراجعة الإدارة.');
            setIsLoading(false);
            return;
          }

          const roleId = userData.roleId;
          const userPermissions = userData.permissions;
          
          let permissions: string[] = [];
          if (userPermissions && userPermissions.length > 0) {
            permissions = userPermissions;
          } else if (roleId) {
            try {
              const roleDoc = await getDoc(doc(db, 'roles', roleId));
              if (roleDoc.exists()) {
                permissions = roleDoc.data().permissions || [];
              } else {
                if (roleId === 'cashier' || roleId === 'pos') permissions = ['pos.access', 'product.availability'];
                if (roleId === 'chef' || roleId === 'kitchen') permissions = ['kitchen.access', 'product.availability'];
                if (roleId === 'driver') permissions = ['driver.access'];
              }
            } catch (e) {
              console.error('Error fetching role permissions:', e);
            }
          }
          
          const hasAdminPerms = permissions.some(p => ['inventory.view', 'inventory.edit', 'reports.view', 'settings.access', 'users.manage'].includes(p));
          
          let moduleCount = 0;
          if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') moduleCount++;
          if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') moduleCount++;
          if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') moduleCount++;
          if (permissions.includes('driver.access') || roleId === 'driver') moduleCount++;

          if (moduleCount > 1) {
            navigate('/hub');
          } else if (hasAdminPerms || roleId === 'admin' || roleId === 'manager') {
            navigate('/admin');
          } else if (permissions.includes('pos.access') || roleId === 'cashier' || roleId === 'pos') {
            navigate('/pos');
          } else if (permissions.includes('kitchen.access') || roleId === 'chef' || roleId === 'kitchen') {
            navigate('/kitchen');
          } else if (permissions.includes('driver.access') || roleId === 'driver') {
            navigate('/driver');
          } else {
            navigate('/hub');
          }
        } else {
          if (actualEmail === 'salem.sam59@gmail.com') {
            navigate('/hub');
          } else if (actualEmail.endsWith('@restaurant.internal')) {
            await auth.signOut().catch(e => console.error("Sign out error:", e));
            setError('هذا الحساب غير موجود أو تم حذفه. يرجى مراجعة الإدارة.');
            setIsLoading(false);
            return;
          } else {
            navigate('/customer');
          }
        }
      } catch (roleError: any) {
        console.error('Error fetching user role:', roleError);
        if (roleError.message?.includes('offline') || roleError.code === 'unavailable') {
          setError('فشل الاتصال: تأكد من توفر شبكة إنترنت، أو جرب شبكة أخرى. (للدخول بدون إنترنت، يجب تسجيل الدخول مسبقاً لحفظ بياناتك).');
          setIsLoading(false);
          return;
        }
        navigate('/hub');
      }
    } catch (err: any) {
      if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/user-not-found' && err.code !== 'auth/wrong-password' && err.code !== 'auth/network-request-failed' && err.code !== 'auth/too-many-requests') {
        console.error('Login error:', err);
      }
      
      // Auto-create admin user if it doesn't exist (for first time setup)
      if (normalizedEmail === 'salem.sam59@gmail.com' && 
         (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password')) {
        try {
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          await createUserWithEmailAndPassword(auth, normalizedEmail, password);
          // Auto-login after creation
          navigate('/hub');
          return;
        } catch (createErr: any) {
          if (createErr.code === 'auth/email-already-in-use') {
             setError('كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى أو استخدام "نسيت كلمة المرور".');
          } else {
             console.error('Failed to create admin user:', createErr);
             setError('فشل إنشاء حساب المسؤول. يرجى التأكد من تفعيل تسجيل الدخول بالبريد الإلكتروني في إعدادات Firebase.');
          }
          setIsLoading(false);
          return;
        }
      }

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى المحاولة لاحقاً أو استعادة كلمة المرور.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('فشل الاتصال: تأكد من توفر شبكة إنترنت، أو جرب شبكة أخرى. (للدخول بدون إنترنت، يجب تسجيل الدخول مسبقاً لحفظ بياناتك).');
      } else {
        setError('فشل تسجيل الدخول. يرجى التأكد من تفعيل تسجيل الدخول في إعدادات Firebase.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden font-sans" dir="rtl">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934&auto=format&fit=crop" 
          alt="Restaurant Background" 
          className="w-full h-full object-cover opacity-30"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-[#050505]"></div>
      </div>

      <div className="w-full max-w-lg p-6 relative z-10">
        <div className="text-center mb-8">
          {invoiceSettings?.logoUrl ? (
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white mb-6 shadow-2xl p-2 overflow-hidden border-2 border-primary-500">
              <img src={invoiceSettings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 mb-6 shadow-2xl">
              <UtensilsCrossed className="w-10 h-10 text-primary-500" />
            </div>
          )}
          <h1 className="text-4xl font-bold text-foreground mb-3 tracking-tight">مرحباً بك</h1>
          <p className="text-muted text-lg">{storeSettings?.nameAr || 'نظام إدارة المطاعم المتكامل'}</p>
        </div>

        <div className="bg-[#151518] border border-[#222] rounded-3xl p-8 shadow-2xl relative mt-4">
          
          <div className="relative pb-4 mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#333]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#151518] px-4 text-gray-400 rounded-full border border-[#333]">دخول الموظفين</span>
            </div>
          </div>

          {/* Staff Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-sm text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#1e1e24] border-none text-white text-sm rounded-xl focus:ring-1 focus:ring-primary-500 block pr-11 p-4 placeholder-gray-500 transition-all"
                  placeholder="اسم المستخدم"
                  dir="ltr"
                  required
                />
              </div>
              
              <div className="relative">
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1e1e24] border-none text-white text-sm rounded-xl focus:ring-1 focus:ring-primary-500 block pr-11 p-4 placeholder-gray-500 transition-all"
                  placeholder="كلمة المرور"
                  dir="ltr"
                  required
                />
              </div>
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-primary-600/50 disabled:cursor-not-allowed text-white rounded-xl py-4 text-base font-bold transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-xs text-muted-foreground mt-8 font-medium tracking-wide">
          نظام إدارة المطاعم © 2026 — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
