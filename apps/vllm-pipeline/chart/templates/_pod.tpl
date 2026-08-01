{{/*
Shared pod template (metadata + spec) used identically by both the Deployment
(prod CPU) and the Rollout (staging GPU canary). Include with `.` and nindent.
*/}}
{{- define "vllm-pipeline.podTemplate" -}}
metadata:
  labels:
    {{- include "vllm-pipeline.labels" . | nindent 4 }}
spec:
  enableServiceLinks: false
  {{- if .Values.gpu.enabled }}
  # k3s exposes the host nvidia-container-runtime as the `nvidia` RuntimeClass.
  runtimeClassName: {{ .Values.gpu.runtimeClassName }}
  nodeSelector:
    {{- toYaml .Values.gpu.nodeSelector | nindent 4 }}
  tolerations:
    {{- toYaml .Values.gpu.tolerations | nindent 4 }}
  {{- end }}
  containers:
    - name: vllm
      image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
      imagePullPolicy: {{ .Values.image.pullPolicy }}
      args:
        - "--model"
        - {{ .Values.model.name | quote }}
        - "--max-model-len"
        - {{ .Values.model.maxModelLen | quote }}
        - "--host"
        - "0.0.0.0"
        - "--port"
        - {{ .Values.service.port | quote }}
        {{- if .Values.gpu.enabled }}
        - "--gpu-memory-utilization"
        - {{ .Values.model.gpuMemoryUtilization | quote }}
        {{- end }}
        {{- /* CPU path uses the dedicated vllm/vllm-openai-cpu image, which
               auto-detects the CPU platform - no --device flag needed. */}}
        {{- with .Values.model.extraArgs }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      env:
        - name: HF_HOME
          value: /root/.cache/huggingface
        {{- with .Values.hfTokenSecret }}
        - name: HF_TOKEN
          valueFrom:
            secretKeyRef:
              name: {{ . }}
              key: HF_TOKEN
        {{- end }}
        {{- with .Values.extraEnv }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      ports:
        - name: http
          containerPort: {{ .Values.service.port }}
      resources:
        requests:
          cpu: {{ .Values.resources.requests.cpu | quote }}
          memory: {{ .Values.resources.requests.memory | quote }}
          {{- if .Values.gpu.enabled }}
          nvidia.com/gpu: {{ .Values.gpu.count }}
          {{- end }}
        limits:
          cpu: {{ .Values.resources.limits.cpu | quote }}
          memory: {{ .Values.resources.limits.memory | quote }}
          {{- if .Values.gpu.enabled }}
          nvidia.com/gpu: {{ .Values.gpu.count }}
          {{- end }}
      # Model download + load is slow (esp. CPU), so allow a long startup window.
      startupProbe:
        httpGet:
          path: /health
          port: http
        periodSeconds: 15
        failureThreshold: 80
      readinessProbe:
        httpGet:
          path: /health
          port: http
        periodSeconds: 10
      livenessProbe:
        httpGet:
          path: /health
          port: http
        periodSeconds: 20
      volumeMounts:
        - name: model-cache
          mountPath: /root/.cache/huggingface
        - name: shm
          mountPath: /dev/shm
  volumes:
    - name: shm
      emptyDir:
        medium: Memory
        sizeLimit: {{ .Values.shmSize | quote }}
    - name: model-cache
      {{- if eq (include "vllm-pipeline.persistModelCache" .) "true" }}
      persistentVolumeClaim:
        claimName: {{ .Values.appName }}-model-cache
      {{- else }}
      emptyDir: {}
      {{- end }}
{{- end -}}
