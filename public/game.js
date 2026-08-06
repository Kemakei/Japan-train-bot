let joystickVisible = true;

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: "game",
    physics: {
        default: "arcade",
        arcade: {
            debug: false
        }
    },
    scene: {
        preload,
        create,
        update
    }
};

let player;
let cursors;

let joystickBase;
let joystickStick;

let moveX = 0;
let moveY = 0;

new Phaser.Game(config);

function preload() {
    this.load.image("grass", "assets/grass.png");
    this.load.image("player", "assets/player.png");
}

function create() {
    this.add.tileSprite(
        0,
        0,
        this.scale.width,
        this.scale.height,
        "grass"
    ).setOrigin(0);

    player = this.physics.add.sprite(
        this.scale.width / 2,
        this.scale.height / 2,
        "player"
    );

    player.setCollideWorldBounds(true);

    cursors = this.input.keyboard.createCursorKeys();

    createJoystick(this);
}

function update() {
    const speed = 250;

    let x = 0;
    let y = 0;

    if (cursors.left.isDown) x = -1;
    if (cursors.right.isDown) x = 1;
    if (cursors.up.isDown) y = -1;
    if (cursors.down.isDown) y = 1;

    if (moveX !== 0) x = moveX;
    if (moveY !== 0) y = moveY;

    player.setVelocity(
        x * speed,
        y * speed
    );
}

function createJoystick(scene) {
    joystickBase = scene.add.circle(
        120,
        scene.scale.height - 120,
        60,
        0xffffff,
        0.3
    );

    joystickStick = scene.add.circle(
        120,
        scene.scale.height - 120,
        30,
        0xffffff,
        0.7
    );

    joystickBase.setScrollFactor(0);
    joystickStick.setScrollFactor(0);

    scene.input.on("pointermove", pointer => {
        if (!pointer.isDown) return;

        let dx = pointer.x - joystickBase.x;
        let dy = pointer.y - joystickBase.y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 60) {
            dx = dx / distance * 60;
            dy = dy / distance * 60;
        }

        joystickStick.x = joystickBase.x + dx;
        joystickStick.y = joystickBase.y + dy;

        moveX = dx / 60;
        moveY = dy / 60;
    });

    scene.input.on("pointerup", () => {
        moveX = 0;
        moveY = 0;

        joystickStick.x = joystickBase.x;
        joystickStick.y = joystickBase.y;
    });
}

document.getElementById("toggleJoystick").onclick = () => {
    joystickVisible = !joystickVisible;

    joystickBase.setVisible(joystickVisible);
    joystickStick.setVisible(joystickVisible);
};