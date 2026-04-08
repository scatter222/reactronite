# Upload scripts to VM after it's created
resource "null_resource" "upload_scripts" {
  depends_on = [azurerm_linux_virtual_machine.main]

  # Trigger re-upload if any script or wizard app changes
  triggers = {
    script_hash = sha256(join("", [
      for f in fileset("${path.module}/scripts", "*.sh") : filesha256("${path.module}/scripts/${f}")
    ]))
    wizard_hash = sha256(join("", [
      for f in fileset("${path.module}/../../apps/wizard", "{*.json,*.xml,*.ts,*.tsx,*.js,*.css,*.html,.npmrc,forge.*,tsconfig.*,components.*,eslint.*,package.json,pnpm-lock.yaml}") :
      filesha256("${path.module}/../../apps/wizard/${f}")
    ]))
  }

  connection {
    type        = "ssh"
    user        = var.admin_username
    host        = azurerm_public_ip.main.ip_address
    private_key = file("~/.ssh/id_rsa")
  }

  # Upload install scripts
  provisioner "file" {
    source      = "${path.module}/scripts"
    destination = "/tmp/scripts"
  }

  # Upload wizard app
  provisioner "file" {
    source      = "${path.module}/../../apps/wizard/"
    destination = "/tmp/wizard-app"
  }

  # Move into place and ensure dotfiles are present
  provisioner "remote-exec" {
    inline = [
      "sudo mkdir -p /opt/install",
      "sudo rm -rf /opt/install/scripts",
      "sudo mv /tmp/scripts /opt/install/scripts",
      "sudo chmod +x /opt/install/scripts/*.sh",
      "echo 'Scripts uploaded to /opt/install/scripts'",
      "ls -la /opt/install/scripts/",
      "echo '---'",
      "ls -la /tmp/wizard-app/ | head -10",
      "echo 'Wizard app uploaded to /tmp/wizard-app'"
    ]
  }
}

# Run full installation after upload
resource "null_resource" "run_installation" {
  depends_on = [null_resource.upload_scripts]

  triggers = {
    upload_id = null_resource.upload_scripts.id
  }

  connection {
    type        = "ssh"
    user        = var.admin_username
    host        = azurerm_public_ip.main.ip_address
    private_key = file("~/.ssh/id_rsa")
  }

  provisioner "remote-exec" {
    inline = [
      "sudo bash /opt/install/scripts/00-install-all.sh"
    ]
  }
}

output "scripts_uploaded" {
  description = "Confirmation that scripts were uploaded"
  value       = "Scripts uploaded to /opt/install/scripts on VM"
  depends_on  = [null_resource.upload_scripts]
}

output "installation_command" {
  description = "Command to re-run installation manually"
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.main.ip_address} 'sudo bash /opt/install/scripts/00-install-all.sh'"
  depends_on  = [null_resource.upload_scripts]
}

output "rdp_command" {
  description = "RDP connection command"
  value       = "xfreerdp /v:${azurerm_public_ip.main.ip_address} /u:azureuser /p:test123 /size:1920x1080 /dynamic-resolution"
  depends_on  = [null_resource.run_installation]
}
