@echo off
title Concilion CRM
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\crm-supervisor.ps1" -OpenBrowser
