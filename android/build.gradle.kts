allprojects {
    repositories {
        google()
        mavenCentral()
    }

    // Suppress Java compiler warnings that originate from plugin dependencies
    // compiled with Java 8 source/target compatibility (obsolete in newer JDKs)
    // and from deprecated/unchecked API usage in third-party plugin code.
    tasks.withType<JavaCompile>().configureEach {
        options.compilerArgs.addAll(listOf(
            "-Xlint:-options",      // source/target value 8 is obsolete
            "-Xlint:-deprecation",  // uses or overrides a deprecated API
            "-Xlint:-unchecked"     // uses unchecked or unsafe operations
        ))
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
