package io.github.cjsan30.shinhanhae.calculator;

import android.app.AlertDialog;
import android.util.Log;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String UPDATE_LOG_TAG = "ShinhanhaeUpdate";
    private AppUpdateManager appUpdateManager;
    private ActivityResultLauncher<IntentSenderRequest> updateLauncher;
    private InstallStateUpdatedListener updateStateListener;
    private boolean updateFlowStarted;
    private boolean updateReadyDialogVisible;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SmsBridgePlugin.class);
        registerPlugin(PolicyOcrPlugin.class);
        registerPlugin(NotificationBridgePlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(EvidenceVaultPlugin.class);
        registerPlugin(AppHealthPlugin.class);
        registerPlugin(ExternalAppPlugin.class);
        super.onCreate(savedInstanceState);
        initializeInAppUpdates();
    }

    @Override
    public void onResume() {
        super.onResume();
        SupportWidgetProvider.updateAll(this);
        checkForInAppUpdate();
    }

    @Override
    public void onDestroy() {
        if (appUpdateManager != null && updateStateListener != null) {
            appUpdateManager.unregisterListener(updateStateListener);
        }
        super.onDestroy();
    }

    private void initializeInAppUpdates() {
        appUpdateManager = AppUpdateManagerFactory.create(this);
        updateLauncher = registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> updateFlowStarted = false
        );
        updateStateListener = state -> {
            if (state.installStatus() == InstallStatus.DOWNLOADED) {
                showUpdateReadyDialog();
            }
        };
        appUpdateManager.registerListener(updateStateListener);
        checkForInAppUpdate();
    }

    private void checkForInAppUpdate() {
        if (appUpdateManager == null || updateLauncher == null || updateFlowStarted) return;
        appUpdateManager.getAppUpdateInfo()
            .addOnSuccessListener(this::startFlexibleUpdateIfAvailable)
            .addOnFailureListener(error -> Log.i(UPDATE_LOG_TAG, "Play update check is unavailable", error));
    }

    private void startFlexibleUpdateIfAvailable(AppUpdateInfo updateInfo) {
        if (updateInfo.installStatus() == InstallStatus.DOWNLOADED) {
            showUpdateReadyDialog();
            return;
        }
        if (updateInfo.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE
            || !updateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) return;
        updateFlowStarted = true;
        appUpdateManager.startUpdateFlowForResult(
            updateInfo,
            updateLauncher,
            AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
        );
    }

    private void showUpdateReadyDialog() {
        if (isFinishing() || updateReadyDialogVisible) return;
        updateReadyDialogVisible = true;
        new AlertDialog.Builder(this)
            .setTitle("업데이트 준비 완료")
            .setMessage("새 버전이 다운로드되었습니다. 다시 시작하면 업데이트가 적용됩니다.")
            .setNegativeButton("나중에", (dialog, which) -> updateReadyDialogVisible = false)
            .setPositiveButton("다시 시작", (dialog, which) -> appUpdateManager.completeUpdate())
            .setOnDismissListener(dialog -> updateReadyDialogVisible = false)
            .show();
    }
}
